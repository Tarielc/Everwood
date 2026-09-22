import * as Phaser from 'phaser';

import { MovementController } from "../components/MovementController"
import { AnimationController, Facing } from "../components/AnimationController"
import { HealthComponent, HealthChange, HealthEvent } from "../components/HealthComponent"
import { EquipmentComponent, EquipmentEvent } from "../components/EquipmentComponent"
import { ItemDefinition, ItemId } from '../data/items';
import { PLAYER_ANIMS } from '../data/animations';
import {
    PLAYER_UNARMED_ATTACK,
    PLAYER_BODY,
    PLAYER_HEALTH,
    PLAYER_HEALTH_BUS,
    PLAYER_MOVEMENT,
    PLAYER_RESPAWN_INVULNERABILITY_MS,
} from '../data/player';
import { InputState } from '../systems/inputs/InputController';
import { StateMachine } from '../systems/state/StateMachine';
import { AudioController } from '../systems/audio/AudioController';
import { PLAYER_SOUNDS } from '../data/audio';
import { LOW_HEALTH_RATIO } from '../config/audio';
import { createPlayerStates, PlayerState } from '../systems/state/PlayerStates';
import { MeleeAttack } from '../components/attack/MeleeAttack';

/** How fast the sprite blinks while it is in i-frames */
const INVULNERABILITY_BLINK_MS = 70
/** How much transparent is sprite when its in i-frames */
const INVULNERABILITY_BLINK_ALPHA = 0.35

/** color of the flash when player takes damage */
const DAMAGE_FLASH_COLOR = 0xFF2C2C
/** How fast sprite blinkc when it takes damage */
const DAMAGE_FLASH_MS = 60

/** How much of players speed is grounded while swinging */
const SWING_FOOT_DRAG = 0.6

/** Input fed to the movement while stunned - nothing held, nothing pressed */
const NO_INPUT: InputState = {
    moveLeft: false,
    moveRight: false,
    sprintHeld: false,
    jumpHeld: false,
    jumpJustPressed: false,
    jumpJustReleased: false,
    attackHeld: false,
    attackJustPressed: false,
}

/**
 * The player-controller character
 * 
 * A thing coordinator over a set of components - it owns no gameplay logic of its own
 * beyond wiring them together each frame:
 * - {@link MovementController}
 * - {@link AnimationController}
 * - {@link StateMachine}
 * - {@link HealthComponent}
 * - {@link EquipmentController}
 * - {@link MeeleAttack}
 * 
 * Deciding who a swing actually hits is left to the scene
 */
export default class Player extends Phaser.Physics.Arcade.Sprite {
    /** Controls movement*/
    private movement: MovementController
    /** player animations and mirrors sprite to match facing */
    private animations: AnimationController<typeof PLAYER_ANIMS>
    /** behaviour states and transitions between them */
    private stateMachine: StateMachine<Player>
    /** hitpoints, regenration, etc - broacasting on global event bus*/
    private health: HealthComponent
    /** item currently held, drawn as an overlay on top of this sprite */
    private equipment: EquipmentComponent
    /** Meele swing - its config follows whatever items is equipped */
    private attack: MeleeAttack

    /**
     * Adds players to the scene and physics world, while also settings it's
     * collision world bounds. Defines size of a sprite and hitbox.
     * 
     * Initialized every components and set's listeners - for health, equipment, and scene shutdown.
     * 
     * @param scene - Scene where to spawn a player in
     * @param x - spawn X cooridnate (world)
     * @param y - spaw Y coordinate (world)
     * @param texture - Texture sprite key of the player
     * @param controls - Input controls of the player, read every frame
     */
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
        this.setSize(PLAYER_BODY.width, PLAYER_BODY.height);
        this.setOffset(PLAYER_BODY.offsetX, PLAYER_BODY.offsetY);

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

        // the equipped item is drawn as an overlay that copies this sprite's frames
        this.equipment = new EquipmentComponent(this);

        // the swing's timing and reach - both follow the equipment, and who it
        // lands on is the scene's business
        this.attack = new MeleeAttack(this, PLAYER_UNARMED_ATTACK);

        // started last, and deliberately not chained onto the line that built it: the
        // first state's enter() runs inside this call, and it reads the player back
        // through the getters - all of which have to be standing up by then
        this.stateMachine.start(PlayerState.Idle)

        // health drives the states, the states never poll it back
        this.bindHealth()
        this.bindEquipment()

        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this)
    }

    /**
     * Run on every frame, called in `GameScene.update()`
     * 
     * Order matters.
     *  
     * @param time - Total amount of the time elapsed since the game started
     * @param delta - Time elapsed since the previous frame (16.67 for 60FPS)
     */
    update(time: number, delta: number) {
        // ticks i-frames and regen, and can emit on its own (regen heals, i-frames ending)
        this.health.update(delta)

        if (this.health.isDead) {
            // a corpse still falls, it just stops steering
            this.setAccelerationX(0)
        } else if (this.isStunned) {
            // gravity and drag still run, so a stun mid-jump falls and a stun
            // mid-run slides to a stop - the player just can't steer or swing
            this.movement.update(NO_INPUT, delta)
        } else {
            // remembered even if this frame can't act on it, so a press during the
            // tail of one swing flows into the next
            if (this.controls.attackJustPressed) this.attack.queue()

            // face where we're steering - neutral input keeps the last facing, and
            // a swing already underway keeps the direction it started with
            if (!this.attack.isAttacking) this.setFacing()

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

    /** Set player's facing direction to sprite and physics body */
    setFacing(){
        this.animations.setFacing(this.steeredFacing())
        this.applyBodyOffset()
    }

    /**
     * Put an item in the player's hand
     * 
     * @param id - Item id we want to equip
     * @returns item we equipped
     */
    equip(id: ItemId): ItemDefinition {
        return this.equipment.equip(id)
    }

    /** Remove an item from the player's hand */
    unequip(): ItemDefinition | null {
        return this.equipment.unequip()
    }

    /** player's equipment component */
    get gear(): EquipmentComponent {
        return this.equipment
    }

    /** damage of an equiped item */
    get attackDamage(): number {
        return this.equipment.damage
    }

    /**
     * Player takes a hit/damage. starts i-frames, flashes the sprite and moves
     * to the hurt state or dead.
     * 
     * @param amount - amount of damage to take.
     * @param source - source of hit/damage.
     * @returns `false` if i-frames or death swallowed damage, `true` otherwise.
     */
    takeDamage(amount: number, source?: unknown): boolean {
        return this.health.damage(amount, source)
    }

    /**
     * Heal the player - clamped to max health.
     * 
     * @param amount - amount to heal.
     * @param source - healing source.
     * @returns `true` if heal attempt was succesfull, `false` otherwise.
     */
    heal(amount: number, source?: unknown): boolean {
        return this.health.heal(amount, source)
    }

    /**
     * Respawn player to the world
     * 
     * Reset position, velocity, acceleration, etc. Clears death animation
     * lock and revives with {@link PLAYER_RESPAWN_INVULNERABILITY_MS} of i-frames,
     * and move state machine back to idle. 
     * 
     * @param x - Respawn X coordinate (world)
     * @param y - Respawn Y coordinate (world)
     * @param current - new health to be spawned with
     */
    respawn(x: number, y: number, current?: number): void {
        this.setPosition(x, y)
        this.setVelocity(0, 0)
        this.setAccelerationX(0)
        this.setAlpha(1)

        // clears the death animation's lock, which nothing short of force would beat
        this.animations.stop()
        this.health.revive(current, PLAYER_RESPAWN_INVULNERABILITY_MS)
    }

    /**
     * Wire health events to player:
     * - Damage - flash, and transition to hurt state if it wasn't fatal
     * - Died - transition to death state
     * - Revived - transition to idle state
     * - Invulnerability End - make sure player is fully opaque
     */
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

        // the heartbeat that says the next hit is the last one. on the crossing rather
        // than on every change, so regen ticking back over the line and a second hit
        // below it don't both set it off - the sound's own throttle catches the rest
        this.health.on(HealthEvent.Changed, (change: HealthChange) => {
            const ratio = change.current / change.max
            const was = change.previous / change.max

            if (ratio > 0 && ratio <= LOW_HEALTH_RATIO && was > LOW_HEALTH_RATIO) {
                AudioController.instance.play(PLAYER_SOUNDS.lowHealth)
            }
        })
    }

    /**
     * bind equipment to the player which decides size of next swing
     * if no item is equipped, it falls back to {@link PLAYER_UNARMED_ATTACK}.
     */
    private bindEquipment(): void {
        const applySwing = () => {
            this.attack.setConfig(this.equipment.item?.swing ?? PLAYER_UNARMED_ATTACK)
        }

        // the equipment component owns these listeners, so destroy() unhooks them with it
        this.equipment.on(EquipmentEvent.Equipped, applySwing)
        this.equipment.on(EquipmentEvent.Unequipped, applySwing)
    }

    /**
     * brief white flash on hit - FILL replaces the texture colout outright
     * so the siljouetter reads even against a busy background
     */
    private flashDamage(): void {
        this.setTint(DAMAGE_FLASH_COLOR).setTintMode(Phaser.TintModes.FILL)
        this.equipment.flash(DAMAGE_FLASH_COLOR)

        this.scene.time.delayedCall(DAMAGE_FLASH_MS, () => {
            this.clearTint().setTintMode(Phaser.TintModes.MULTIPLY)
            this.equipment.clearFlash()
        })
    }

    /**
     * Blink/Flash sprite while the player has i-frames. Driven by game time,
     * so it needs no timer of its own. No matter what last alpha value is
     * it is set to 1 in {@link bindHealth} after i-frames end. 
     * 
     * @param time - Time elapsed since the game started
     */
    private updateInvulnerabilityBlink(time: number): void {
        if (!this.health.isInvulnerable) return

        const visible = Math.floor(time / INVULNERABILITY_BLINK_MS) % 2 === 0
        this.setAlpha(visible ? 1 : INVULNERABILITY_BLINK_ALPHA)
    }

    /**
     * Whether a player can swing or not.
     * 
     * @returns `true` if player can swing, `false` otherwise.
     */
    private canSwing(): boolean {
        return this.attack.canStart && !this.stateMachine.isCurrentState(PlayerState.Hurt)
    }

    /** `true` while a hit has the player stunned and ignoring input */
    get isStunned(): boolean {
        return this.stateMachine.isCurrentState(PlayerState.Hurt)
    }

    /**
     * Whether a player is staning on something
     * 
     * @returns `true` if player is touching ground, `false` otherwise.
     */
    private isGrounded(): boolean {
        const body = this.body as Phaser.Physics.Arcade.Body
        return body.blocked.down || body.touching.down
    }

    /**
     * Apply drag to slow velocity.
     * So a grounded swing bring player to a stop.
     */
    private plantFeet(): void {
        const body = this.body as Phaser.Physics.Arcade.Body
        body.velocity.x *= SWING_FOOT_DRAG
    }

    /**
     * Facing diretion based on currently held movement input.
     * 
     * @returns `-1` if left is held, `1` if right is held,
     *  `0` if neither - keeps the current facing.
     */
    private steeredFacing(): Facing {
        if (this.controls.moveLeft) return -1
        if (this.controls.moveRight) return 1
        return 0
    }

    /**
     * Flip player hitbox.
     * Hitbox isn't symeterical so flipping only sprite causes uneven hitbox.
     */
    private applyBodyOffset(): void {
        const { width, offsetX, offsetY } = PLAYER_BODY
        const mirrored = this.width - offsetX - width

        this.setOffset(this.flipX ? mirrored : offsetX, offsetY)
    }

    /** Destructor and cleanup */
    destroy(fromScene?: boolean): void {
        this.stateMachine?.destroy()
        this.animations?.destroy()
        this.health?.destroy()
        this.equipment?.destroy()
        this.attack?.destroy()
        super.destroy(fromScene)
    }

    /** input controls of the player */
    get inputState(): InputState {
        return this.controls
    }

    /** statemachine of the player */
    get states(): StateMachine<Player> {
        return this.stateMachine
    }

    /** movementcontroller of the player */
    get getMovement(): MovementController {
        return this.movement
    }
    
    /** animation controller of the player */
    get getAnimations(): AnimationController<typeof PLAYER_ANIMS> {
        return this.animations
    }

    /** health component of the player */
    get getHealth(): HealthComponent {
        return this.health
    }

    /** attack component of the player */
    get getAttack(): MeleeAttack {
        return this.attack
    }
}
