import * as Phaser from 'phaser';
import { InputState } from '../systems/inputs/InputController';
import { damping } from '../utils/damping';

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
 * Player movement: walking, sprinting, double jumping, and falling driven
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
    /** Ground/coyote jump uses one, midair jump uses both; landing restores them */
    private jumpsUsed:number = 0
    private didJump:boolean = false

    /**
     * Scales walk speed, sprint speed and acceleration together - a speed boost or a
     * slow. Jumping and falling are left alone, so a boost can't change what's reachable
     */
    speedMultiplier:number = 1

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
     * @param capSpeed - clamp to walk/sprint speed - off while stunned, so a knockback isn't cut short
     */
    update(input: InputState, dt:number, capSpeed = true): void {
        this.didJump = false
        this.updateTimers(input, dt)
        this.applyHorizontal(input, dt, capSpeed)
        this.applyGravity()
        this.tryConsumeJump(input)
        this.applyJumpCut(input)
    }

    /** Whether a jump fired in the latest update, for animation and sound feedback */
    get jumpedThisFrame(): boolean {
        return this.didJump
    }

    /** Whether solid ground supports the player, excluding trigger overlaps and takeoff. */
    get isGrounded(): boolean {
        const body = this.sprite.body as Phaser.Physics.Arcade.Body
        // Overlaps (including checkpoints) set touching.down without supporting the body.
        // Upward movement overrides blocked.down left over from the takeoff frame.
        return body.blocked.down && body.velocity.y >= 0
    }

    /** Refill and drain the coyote and jump-buffer timers */
    private updateTimers(input: InputState, dt:number){
        // Coyote Time: countdown only while airborne
        if(this.isGrounded){
            this.coyoteTimer = this.config.coyoteTimeMs
            this.jumpsUsed = 0
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

    /** Consume a buffered press for a ground/coyote jump or the one available midair jump. */
    private tryConsumeJump(input: InputState){
        // check if sprite is allowed to jump
        if(this.jumpBufferTimer > 0
            && this.jumpsUsed < 2
            && input.jumpHeld
        ){
            // After coyote time expires, walking off a ledge leaves only the midair jump.
            this.jumpsUsed = this.jumpsUsed === 0 && this.coyoteTimer > 0 ? 1 : 2
            this.sprite.setVelocityY(this.config.jumpVelocity)
            this.sprite.setGravityY(0)
            this.didJump = true
            this.coyoteTimer = 0
            this.jumpBufferTimer = 0
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
    private applyHorizontal(input: InputState, dt: number, capSpeed: boolean): void {
        const body = this.sprite.body as Phaser.Physics.Arcade.Body
        const grounded = this.isGrounded
        const acceleration = this.config.acceleration * this.speedMultiplier * (grounded ? 1 : 0.7) // weak air control

        // accelerate sprite - mirroring it belongs to AnimationController.setFacing()
        if(input.moveLeft) {
            body.setAccelerationX(-acceleration)
        } else if (input.moveRight) {
            body.setAccelerationX(acceleration)
        } else {
            // set accelerations to 0 and apply drag to make deceleration feel natural
            body.setAccelerationX(0)
            body.velocity.x *= damping(grounded ? 0.85 : 0.95, dt)
        }

        if (!capSpeed) return

        // lock max horizontal speed (based on whether sprint is held or not)
        const maxSpeed = this.speedMultiplier * (input.sprintHeld
            ? this.config.sprintSpeed
            : this.config.speed)
        body.velocity.x = Phaser.Math.Clamp(body.velocity.x, -maxSpeed, maxSpeed)
    }
}
