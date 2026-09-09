import * as Phaser from 'phaser';

import { MovementController } from "../components/MovementController"
import { AnimationController, Facing } from "../components/AnimationController"
import { HealthComponent, HealthChange, HealthEvent } from "../components/HealthComponent"
import { EquipmentComponent } from "../components/EquipmentComponent"
import { MeleeAttack } from "../components/MeleeAttack"
import {
    ItemDefinition,
    ItemId,
    PLAYER_ANIMS,
    PLAYER_ATTACK,
    PLAYER_HEALTH,
    PLAYER_HEALTH_BUS,
    PLAYER_MOVEMENT,
    PLAYER_RESPAWN_INVULNERABILITY_MS,
} from '../utils/constants';
import { InputState } from '../systems/inputs/InputController';
import { StateMachine } from '../systems/state/StateMachine';
import { createPlayerStates, PlayerState } from '../systems/state/PlayerStates';

// how fast the sprite blinks while i-frames are running, in ms per half cycle
const INVULNERABILITY_BLINK_MS = 70
const INVULNERABILITY_BLINK_ALPHA = 0.35

// the white "hit" flash on the frame damage lands
const DAMAGE_FLASH_COLOR = 0xffffff
const DAMAGE_FLASH_MS = 60

// how much of its speed a grounded swing bleeds off per frame - a swing that
// slides across the floor reads as a dodge rather than a commitment
const SWING_FOOT_DRAG = 0.8

export default class Player extends Phaser.Physics.Arcade.Sprite {
    private movement: MovementController
    private animations: AnimationController<typeof PLAYER_ANIMS>
    private stateMachine: StateMachine<Player>
    private health: HealthComponent
    private equipment: EquipmentComponent
    private attack: MeleeAttack

    constructor(
        scene: Phaser.Scene,
        x: number,
        y: number,
        texture: string,
        private controls: InputState
    ) {
        super(scene, x, y, texture);
        // add player sprite and physics to the scene
        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setCollideWorldBounds(true)

        // resize and offset player hitbox, so it's more accurate
        this.setSize(16, 46);
        this.setOffset(32, 18);

        // add movement controller for the player
        this.movement = new MovementController(this, PLAYER_MOVEMENT);

        // registers animations once per texture, then plays them for the state machine.
        // player.png is drawn facing left, so moving right mirrors the frames
        this.animations = new AnimationController(this, PLAYER_ANIMS, { texture, facing: 'left' });

        // hit points and i-frames - mirrored onto the global EventBus so the HUD
        // can follow the player without holding a reference to it
        this.health = new HealthComponent(PLAYER_HEALTH, { busPrefix: PLAYER_HEALTH_BUS });

        // animation/behaviour states - movement physics stays in MovementController
        this.stateMachine = new StateMachine<Player>(this)
            .addStates(...createPlayerStates())
            .start(PlayerState.Idle)

        // the equipped item is drawn as an overlay that copies this sprite's frames
        this.equipment = new EquipmentComponent(this);

        // the swing's timing and reach - what it costs comes from the equipment,
        // and who it lands on is the scene's business
        this.attack = new MeleeAttack(this, PLAYER_ATTACK);

        // health drives the states, the states never poll it back
        this.bindHealth()

        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this)
    }

    update(time: number, delta: number) {
        // ticks i-frames and regen, and can emit on its own (regen heals, i-frames ending)
        this.health.update(delta)

        if (this.health.isDead) {
            // a corpse still falls, it just stops steering
            this.setAccelerationX(0)
        } else {
            // remembered even if this frame can't act on it, so a press during the
            // tail of one swing flows into the next
            if (this.controls.attackJustPressed) this.attack.queue()

            // face where we're steering - neutral input keeps the last facing, and
            // a swing already underway keeps the direction it started with
            if (!this.attack.isAttacking) this.animations.setFacing(this.steeredFacing())

            // decided before the move, so the first frame of a swing is already planted
            if (this.canSwing()) this.stateMachine.transition(PlayerState.Attack)

            // move first, so states react to this frame's resulting velocity
            this.movement.update(this.controls, delta)

            // gravity, jumping and the input buffers all still ran above - a swing
            // can be jumped out of, it just can't be walked out of
            if (this.attack.isAttacking && this.isGrounded()) this.plantFeet()
        }

        // ticks the cooldown and drags the hit area along with the player
        this.attack.update(delta)

        this.updateInvulnerabilityBlink(time)
        this.stateMachine.update(delta)

        // last, so the item copies the pose this frame actually settled on
        this.equipment.update()
    }

    // put an item in the player's hand - swapping straight from another is fine
    equip(id: ItemId): ItemDefinition {
        return this.equipment.equip(id)
    }

    unequip(): ItemDefinition | null {
        return this.equipment.unequip()
    }

    get gear(): EquipmentComponent {
        return this.equipment
    }

    // what a swing lands for, falling back to bare hands
    get attackDamage(): number {
        return this.equipment.damage
    }

    // take a hit - returns false when i-frames or death swallowed it, so the
    // caller can skip the knockback and the hit sound
    takeDamage(amount: number, source?: unknown): boolean {
        return this.health.damage(amount, source)
    }

    heal(amount: number, source?: unknown): boolean {
        return this.health.heal(amount, source)
    }

    // put the player back on their feet at `x, y` with a fresh bar and i-frames
    respawn(x: number, y: number, current?: number): void {
        this.setPosition(x, y)
        this.setVelocity(0, 0)
        this.setAccelerationX(0)
        this.setAlpha(1)

        // clears the death animation's lock, which nothing short of force would beat
        this.animations.stop()
        this.health.revive(current, PLAYER_RESPAWN_INVULNERABILITY_MS)
    }

    private bindHealth(): void {
        // the health component owns these listeners, so destroy() unhooks them with it
        this.health.on(HealthEvent.Damaged, (change: HealthChange) => {
            this.flashDamage()

            // Died fires right after this one and owns the death animation - flinching
            // first would start a hurt state that lives for less than a frame
            if (change.current > 0) this.stateMachine.transition(PlayerState.Hurt, change)
        })

        this.health.on(HealthEvent.Died, () => {
            this.stateMachine.transition(PlayerState.Dead)
        })

        this.health.on(HealthEvent.Revived, () => {
            this.stateMachine.transition(PlayerState.Idle)
        })

        this.health.on(HealthEvent.InvulnerabilityEnd, () => {
            this.setAlpha(1)
        })
    }

    // brief white flash on the hit - FILL replaces the texture colour outright,
    // so the silhouette reads even against a busy background
    private flashDamage(): void {
        this.setTint(DAMAGE_FLASH_COLOR).setTintMode(Phaser.TintModes.FILL)
        this.equipment.flash(DAMAGE_FLASH_COLOR)

        this.scene.time.delayedCall(DAMAGE_FLASH_MS, () => {
            this.clearTint().setTintMode(Phaser.TintModes.MULTIPLY)
            this.equipment.clearFlash()
        })
    }

    private updateInvulnerabilityBlink(time: number): void {
        if (!this.health.isInvulnerable) return

        const visible = Math.floor(time / INVULNERABILITY_BLINK_MS) % 2 === 0
        this.setAlpha(visible ? 1 : INVULNERABILITY_BLINK_ALPHA)
    }

    // a swing needs a buffered press and a finished cooldown, and a state that
    // isn't already busy - a flinch owns the animation, so it can't be swung out of
    private canSwing(): boolean {
        return this.attack.canStart && !this.stateMachine.isCurrentState(PlayerState.Hurt)
    }

    private isGrounded(): boolean {
        const body = this.body as Phaser.Physics.Arcade.Body
        return body.blocked.down || body.touching.down
    }

    // kill the steering a grounded swing was given, without touching the vertical
    // movement the MovementController just worked out
    private plantFeet(): void {
        const body = this.body as Phaser.Physics.Arcade.Body
        body.setAccelerationX(0)
        body.velocity.x *= SWING_FOOT_DRAG
    }

    private steeredFacing(): Facing {
        if (this.controls.moveLeft) return -1
        if (this.controls.moveRight) return 1
        return 0
    }

    destroy(fromScene?: boolean): void {
        this.stateMachine?.destroy()
        this.animations?.destroy()
        this.health?.destroy()
        this.equipment?.destroy()
        this.attack?.destroy()
        super.destroy(fromScene)
    }

    get inputState(): InputState {
        return this.controls
    }

    get states(): StateMachine<Player> {
        return this.stateMachine
    }

    get getMovement(): MovementController {
        return this.movement
    }

    get getAnimations(): AnimationController<typeof PLAYER_ANIMS> {
        return this.animations
    }

    get getHealth(): HealthComponent {
        return this.health
    }

    get getAttack(): MeleeAttack {
        return this.attack
    }
}
