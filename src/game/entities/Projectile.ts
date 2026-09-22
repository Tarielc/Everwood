import * as Phaser from 'phaser';
import { ProjectileDefinition } from '../data/projectiles';
import { AudioController } from '../systems/audio/AudioController';

/**
 * A shot in flight. It carries its own damage and remembers who fired it, so
 * whoever it lands on can be knocked back away from the shooter rather than
 * away from the arrow.
 *
 * It knows nothing about what it can hit - the scene registers the overlap and
 * calls strike() when the shot is spent, the same way it resolves a swing.
 */
export default class Projectile extends Phaser.Physics.Arcade.Sprite {
    /** ms since projectile was fired - discarded after it exceeds projectile.lifetimeMs */
    private lifeTimer: number

    /**
     * 
     * @param scene - Scene to spawn projectile
     * @param x - X coordinate to spawn projectile
     * @param y - Y coordinate to spawn projectile
     * @param definition - projectile definition e.g. arrow
     * @param direction - which direction projectile should move
     * @param damage - damage of a projectile
     * @param shooter - source/shooter of a projectile
     */
    constructor(
        scene: Phaser.Scene,
        x: number,
        y: number,
        readonly definition: ProjectileDefinition,
        direction: -1 | 1,
        readonly damage: number,
        readonly shooter?: unknown,
    ) {
        super(scene, x, y, definition.texture)

        scene.add.existing(this)
        scene.physics.add.existing(this)

        this.lifeTimer = definition.lifetimeMs

        this.setScale(definition.scale)
        // the art points right, so a shot travelling left is mirrored
        this.setFlipX(direction < 0)

        const { width, height, offsetX, offsetY } = definition.body
        this.setSize(width, height)
        this.setOffset(offsetX, offsetY)

        const body = this.body as Phaser.Physics.Arcade.Body
        // a flat shot opts out of the world's gravity outright, rather than
        // fighting it with a matching upward pull every frame
        body.setAllowGravity(definition.gravity > 0)
        if (definition.gravity > 0) body.setGravityY(definition.gravity)

        this.setVelocityX(direction * definition.speed)

        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this)
    }

    /** Update projectile timer and discard it */
    update(_time: number, delta: number): void {
        if (!this.active) return

        this.lifeTimer -= delta
        if (this.lifeTimer <= 0 || this.hasLeftTheWorld()) this.destroy()
    }

    /** discard/spend arrow after it hits something */
    strike(): void {
        // where it landed rather than where the player is, so an arrow that misses
        // somebody across the arena is heard over there
        if (this.definition.impactSound) {
            AudioController.instance.playAt(this.definition.impactSound, this.x, this.y)
        }

        this.destroy()
    }

    /**
     * Check if arrow left world bounds
     * 
     * @returns `true` if it did, `false` otherwise
     */
    private hasLeftTheWorld(): boolean {
        const bounds = this.scene.physics.world.bounds
        return this.x < bounds.left || this.x > bounds.right
            || this.y < bounds.top || this.y > bounds.bottom
    }
}
