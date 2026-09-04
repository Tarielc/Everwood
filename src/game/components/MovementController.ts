import * as Phaser from 'phaser';
import { InputState } from '../systems/InputController';

export interface MovementConfig{
    speed: number,
    acceleration: number,
    drag: number,
    jumpVelocity: number,
    jumpCutMultiplier: number, // cut off jump velocity if jump button is released
    gravity: number,
    fallGravityMultiplier: number, // increase gravity when falling
    coyoteTimeMs: number, // allow jump small window gap to jump after leaving platform
    jumpBufferMs: number, // allow jump if player pressed it slightly before langing
    maxFallSpeed: number,
}

export class MovementController {
    private coyoteTimer:number = 0
    private jumpBufferTimer:number = 0
    private isJumping:boolean = false

    constructor(
        private sprite: Phaser.Physics.Arcade.Sprite,
        private config: MovementConfig
    ) {}

    update(input: InputState, dt:number): void {
        this.updateTimers(input, dt)
        this.applyHorizontal(input)
        this.applyGravity()
        this.tryConsumeJump(input)
        this.applyJumpCut(input)
    }

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

    private applyGravity() {
        const body = this.sprite.body as Phaser.Physics.Arcade.Body

        // if sprite's vertical speed is positive, it's falling, so we need to increate sprite's gravity
        // otherwise trust world's general/base gravity
        if(body.velocity.y > 0){
            body.setGravityY(this.config.gravity * (this.config.fallGravityMultiplier - 1))
        } else {
            body.setGravityY(0)
        }

        // lock mack vertical speed to certain value
        if(body.velocity.y > this.config.maxFallSpeed) {
            body.setVelocityY(this.config.maxFallSpeed)
        }
    }

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

    private applyJumpCut(input: InputState){
        const vy = this.sprite.body!.velocity.y
        // if jump button is released and player still has negative vertical speed, it's moving upwards, so we need to cut the speed
        if(input.jumpJustReleased && vy < 0) {
            this.sprite.setVelocityY(vy * this.config.jumpCutMultiplier)
        }
    }

    private applyHorizontal(input: InputState): void {
        const body = this.sprite.body as Phaser.Physics.Arcade.Body
        const grounded = body.blocked.down || body.touching.down
        const acceleration = this.config.acceleration * (grounded ? 1 : 0.7) // weak air controll

        // accelerate sprite and flip sprite image based on whether it's facing left or right
        if(input.moveLeft) {
            body.setAccelerationX(-acceleration)
            this.sprite.setFlipX(false)
        } else if (input.moveRight) {
            body.setAccelerationX(acceleration)
            this.sprite.setFlipX(true)
        } else {
            // set accelerations to 0 and apply drag to make deceleration feel natural
            body.setAccelerationX(0)
            body.velocity.x *= grounded? 0.85 : 0.95
        }

        // lock max horizontal speed
        body.velocity.x = Phaser.Math.Clamp(body.velocity.x, -this.config.speed, this.config.speed)
    }
}