import * as Phaser from 'phaser';
import { POWER_UP_DROP, PowerUpDefinition, PowerUpDropConfig, PowerUpId } from '../data/powerUps';
import { ATLAS } from '../config/atlas';

/** Depth pickups draw at - under the player (500), over the level */
const PICKUP_DEPTH = 400
/** ms of each blink once a pickup is about to vanish */
const WARN_BLINK_MS = 120
/** How long the collect pop takes - it swells and fades on the spot */
const COLLECT_MS = 220

/**
 * A power up lying in the world, waiting to be walked over.
 *
 * It hops out of whatever dropped it, falls onto the floor under the world's gravity
 * and settles there, bobbing, until it's collected or its lifetime runs out - blinking
 * for the last stretch so the player can tell it's about to go.
 *
 * It knows nothing about the player or what it does to them. The scene registers the
 * overlap and hands the effect over, the same way it resolves a swing or an arrow.
 */
export default class PowerUp extends Phaser.Physics.Arcade.Sprite {
    /** ms left on the floor before it disappears */
    private lifeTimer: number
    /** ms left before it can be picked up */
    private pickupTimer: number
    /** `true` once it has come to rest and started bobbing */
    private settled: boolean = false
    /** `true` once it has been picked up - a second overlap on the way out does nothing */
    private collected: boolean = false

    private bob: Phaser.Tweens.Tween | null = null
    private blink: Phaser.Tweens.Tween | null = null

    /**
     * @param scene - Scene to drop it into
     * @param x - Where it drops from (world)
     * @param y - Where it drops from (world)
     * @param id - Which power up it is
     * @param definition - What it looks like and does
     * @param config - How pickups behave on the floor
     */
    constructor(
        scene: Phaser.Scene,
        x: number,
        y: number,
        readonly id: PowerUpId,
        readonly definition: PowerUpDefinition,
        private readonly config: PowerUpDropConfig = POWER_UP_DROP,
    ) {
        super(scene, x, y, ATLAS, definition.frame)

        scene.add.existing(this)
        scene.physics.add.existing(this)

        this.lifeTimer = config.lifetimeMs
        this.pickupTimer = config.pickupDelayMs

        this.setScale(config.scale).setDepth(PICKUP_DEPTH)
        this.setCollideWorldBounds(true)

        // a little hop out of the foe, off to a random side, so a drop is seen happening
        const side = Math.random() < 0.5 ? -1 : 1
        this.setVelocity(side * config.popVelocityX, config.popVelocityY)
    }

    /**
     * Runs every frame, from `GameScene.update()`. Settles it once it lands, and
     * counts its lifetime down.
     *
     * @param delta - Time since the last frame
     */
    update(delta: number): void {
        if (!this.active || this.collected) return

        if (!this.settled && this.isGrounded()) this.settle()

        if (this.pickupTimer > 0) this.pickupTimer -= delta

        this.lifeTimer -= delta
        if (this.lifeTimer <= 0) {
            this.destroy()
            return
        }

        if (!this.blink && this.lifeTimer <= this.config.warnMs) this.startBlink()
    }

    /**
     * Pick it up - it pops on the spot and removes itself.
     *
     * @returns `true` the first time, `false` if it was already collected or can't be picked up yet
     */
    collect(): boolean {
        if (this.collected || !this.active || this.pickupTimer > 0) return false
        this.collected = true

        const body = this.body as Phaser.Physics.Arcade.Body
        body.enable = false

        this.bob?.remove()
        this.blink?.remove()
        this.setAlpha(1)

        this.scene.tweens.add({
            targets: this,
            scale: this.scale * 1.6,
            alpha: 0,
            duration: COLLECT_MS,
            ease: "Quad.easeOut",
            onComplete: () => this.destroy(),
        })
        return true
    }

    /** `true` once picked up */
    get isCollected(): boolean {
        return this.collected
    }

    /**
     * Stop it where it landed and start the bob. Physics lets go of it - the body
     * follows the sprite from here, so the bob doesn't fight gravity every frame
     */
    private settle(): void {
        this.settled = true

        const body = this.body as Phaser.Physics.Arcade.Body
        body.setVelocity(0, 0)
        body.moves = false

        this.bob = this.scene.tweens.add({
            targets: this,
            y: this.y - this.config.bobHeight,
            duration: this.config.bobMs,
            ease: "Sine.easeInOut",
            yoyo: true,
            repeat: -1,
        })
    }

    /** The going-away blink over the last of its lifetime */
    private startBlink(): void {
        this.blink = this.scene.tweens.add({
            targets: this,
            alpha: 0.25,
            duration: WARN_BLINK_MS,
            yoyo: true,
            repeat: -1,
        })
    }

    /** `true` if it's resting on something */
    private isGrounded(): boolean {
        const body = this.body as Phaser.Physics.Arcade.Body
        return body.blocked.down || body.touching.down
    }

    /** Destructor and cleanup */
    destroy(fromScene?: boolean): void {
        this.bob?.remove()
        this.blink?.remove()
        this.bob = null
        this.blink = null
        super.destroy(fromScene)
    }
}
