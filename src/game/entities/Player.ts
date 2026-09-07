import * as Phaser from 'phaser';

import { MovementController } from "../components/MovementController"
import { AnimationController, Facing } from "../components/AnimationController"
import { HealthComponent, HealthChange, HealthEvent } from "../components/HealthComponent"
import {
    PLAYER_ANIMS,
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

export default class Player extends Phaser.Physics.Arcade.Sprite {
    private movement: MovementController
    private animations: AnimationController<typeof PLAYER_ANIMS>
    private stateMachine: StateMachine<Player>
    private health: HealthComponent

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
            // move first, so states react to this frame's resulting velocity
            this.movement.update(this.controls, delta)

            // face where we're steering - neutral input keeps the last facing
            this.animations.setFacing(this.steeredFacing())
        }

        this.updateInvulnerabilityBlink(time)
        this.stateMachine.update(delta)
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
        this.scene.time.delayedCall(DAMAGE_FLASH_MS, () => {
            this.clearTint().setTintMode(Phaser.TintModes.MULTIPLY)
        })
    }

    private updateInvulnerabilityBlink(time: number): void {
        if (!this.health.isInvulnerable) return

        const visible = Math.floor(time / INVULNERABILITY_BLINK_MS) % 2 === 0
        this.setAlpha(visible ? 1 : INVULNERABILITY_BLINK_ALPHA)
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
}
