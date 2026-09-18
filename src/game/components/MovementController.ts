import * as Phaser from 'phaser';
import { InputState } from '../systems/inputs/InputController';

/**
 * Tuning for a {@link MovementController}. Speeds are in px/s,
 * accelerations in px/s², times in ms.
 */
export interface MovementConfig{
    /** Max horizontal speed while walking */
    speed: number,
    /** Max horizontal speed while sprint is held */
    sprintSpeed: number,
    /** Horizontal acceleration on the ground - 70% of it in the air */
    acceleration: number,
    /** Not read yet - deceleration uses fixed per-frame damping instead */
    drag: number,
    /** Vertical velocity set on jump - negative is up */
    jumpVelocity: number,
    /** Upward velocity is multiplied by this when jump is released mid-rise */
    jumpCutMultiplier: number,
    /**
     * Base for the extra fall gravity - *not* the world gravity. While falling the
     * body gets `gravity * (fallGravityMultiplier - 1)` on top of the world's own
     */
    gravity: number,
    /** How much heavier falling feels than rising - `1` means no difference */
    fallGravityMultiplier: number,
    /** How long after walking off a ledge a jump is still allowed */
    coyoteTimeMs: number,
    /** How long a jump press is remembered, so a press slightly before landing still jumps */
    jumpBufferMs: number,
    /** Terminal downward speed */
    maxFallSpeed: number,
}

/**
 * Playe movement: walking, sprinting, jumping, and falling driven
 * by {@link InputState} each frame.
 *
 * It only touches the physics body velocity, acceleration, and gravity.
 * Facing and animation is handled by `AnimationController`. Whether the owner is
 * allowed ot act is the owners call.
 *
 * Jump feel comes from: coyote time, jump buffering, jump cut,
 * and heavier fall gravity.
 */
export class MovementController {
    /** ms left in which a jump is till allowed - refilled while on the ground */
    private coyoteTimer:number = 0
    /** ms left for the last jump press to still trigger a jump */
    private jumpBufferTimer:number = 0
    /** set on jump, cleared on landing - keeps one press from jumping twice */
    private isJumping:boolean = false

    /**
     * @param sprite - Sprite to move, it must have an arcade body.
     * @param config - Movement configuration, see {@link MovementConfig}. e.g `PLAYER_MOVEMENT`
     */
    constructor(
        private sprite: Phaser.Physics.Arcade.Sprite,
        private config: MovementConfig
    ) {}

    /**
     * Runs every frame. Call it from the owner's `update()`, before
     * anything that reacts to the players speed or placement (e.g. state transitions).
     *
     * @param input - This frame's input
     * @param dt - Time since last frame
     */
    update(input: InputState, dt:number): void {
        this.updateTimers(input, dt)
        this.applyHorizontal(input)
        this.applyGravity()
        this.tryConsumeJump(input)
        this.applyJumpCut(input)
    }

    /** Refill and drain the coyote and jump-buffer timers */
    private updateTimers(input: InputState, dt:number){
        // check if player is grounded
        const grounded = this.sprite.body!.blocked.down

        // Coyote Time: countdown only while airborne
        if(grounded){
            this.coyoteTimer = this.config.coyoteTimeMs
        } else {
            this.coyoteTimer = Math.max(0, this.coyoteTimer - dt)
        }

        // Jump Buffer: remember a jump press briefly, in case it happened slightly before landing
        if(input.jumpJustPressed){
            this.jumpBufferTimer = this.config.jumpBufferMs
        } else {
            this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt)
        }
    }

    /** Adds extra gravity while fallind and caps maximum fall speed at `maxFallSpeed` */
    private applyGravity() {
        const body = this.sprite.body as Phaser.Physics.Arcade.Body

        // if sprite's vertical speed is positive, it's falling, so we need to increase sprite's gravity
        // otherwise trust world's general/base gravity
        if(body.velocity.y > 0){
            body.setGravityY(this.config.gravity * (this.config.fallGravityMultiplier - 1))
        } else {
            body.setGravityY(0)
        }

        // lock max vertical speed to certain value
        if(body.velocity.y > this.config.maxFallSpeed) {
            body.setVelocityY(this.config.maxFallSpeed)
        }
    }

    /** Jumps when a buffered press and coyote time overlap and jump is still held. */
    private tryConsumeJump(input: InputState){
        // check if sprite is allowed to jump
        if(this.jumpBufferTimer > 0
            && this.coyoteTimer > 0
            && !this.isJumping
            && input.jumpHeld
        ){
            // give sprite vertical acceleration
            this.sprite.setVelocityY(this.config.jumpVelocity)
            this.isJumping = true
            this.coyoteTimer = 0
            this.jumpBufferTimer = 0
        }

        // check if sprite is grounded
        if(this.sprite.body!.blocked.down){
            this.isJumping = false
        }
    }

    /** Variable jump height: releasing jump while rising cut vertical velocity by `jumpCutMultiplier` */
    private applyJumpCut(input: InputState){
        const vy = this.sprite.body!.velocity.y
        // if jump button is released and player still has negative vertical speed, it's moving upwards, so we need to cut the speed
        if(input.jumpJustReleased && vy < 0) {
            this.sprite.setVelocityY(vy * this.config.jumpCutMultiplier)
        }
    }

    /**
     * Accelerates toward the held direction (weaker in the air), damps veocity
     * when nothing is held, and clamps maximum walking or sprinting speed.
     */
    private applyHorizontal(input: InputState): void {
        const body = this.sprite.body as Phaser.Physics.Arcade.Body
        const grounded = body.blocked.down || body.touching.down
        const acceleration = this.config.acceleration * (grounded ? 1 : 0.7) // weak air control

        // accelerate sprite - mirroring it belongs to AnimationController.setFacing()
        if(input.moveLeft) {
            body.setAccelerationX(-acceleration)
        } else if (input.moveRight) {
            body.setAccelerationX(acceleration)
        } else {
            // set accelerations to 0 and apply drag to make deceleration feel natural
            body.setAccelerationX(0)
            body.velocity.x *= grounded? 0.85 : 0.95
        }

        // lock max horizontal speed (based on whether sprint is held or not)
        const maxSpeed = input.sprintHeld
            ? this.config.sprintSpeed
            : this.config.speed
        body.velocity.x = Phaser.Math.Clamp(body.velocity.x, -maxSpeed, maxSpeed)
    }
}
