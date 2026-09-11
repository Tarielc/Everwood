import * as Phaser from 'phaser';

import Foe from '../../entities/Foe';
import Player from '../../entities/Player';
import Projectile from '../../entities/Projectile';
import { Attackable, MeleeAttack } from '../../components/MeleeAttack';
import { MapObject, WorldMap } from '../world/WorldMap';

/** target that can receive damage */
interface Combatant extends Attackable {
    takeDamage(amount: number, source?: unknown): boolean
}

/**
 * This class manages collision and overlap between world, player, foes, projectiles, etc.
 * 
 * Register the player before adding foes, projectiles or zones that interacts with the it.
 * Registered colliders and overlaps are destroyed on scene shutdown.
*/
export class CollisionManager {

    /** the playes is what most of everything is registered against */
    private player: Player | null = null

    /** Set to track current foes, removed when they die */
    private readonly foes = new Set<Foe>()

    /** Track all colliders for cleanup */
    private readonly colliders: Phaser.Physics.Arcade.Collider[] = []

    /** Reusable targets bounds to avoid allocating new reactangle for each swing */
    private readonly targetBounds: Phaser.Geom.Rectangle = new Phaser.Geom.Rectangle()

    /**
     * Creates a manager and registers cleanup for scene shutdown
     * 
     * @param scene - Scene that owns the physics interactions
     * @param world - World map that providde solid-layer collisions and zones
     */
    constructor(
        private readonly scene: Phaser.Scene,
        private readonly world: WorldMap,
    ) {
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this)
    }

    /**
     * Registers the players and adds collision with world's solid layers
     * 
     * Call first. Other registrations aren't upated when player is missing.
     * 
     * 
     * @param player - Player to use for subsequent registrations
     * @returns This manager for method chaining
     * 
     * @example
     * ```ts
     * const collisions = new CollisionManager()
     *      .setPlayer(playerObject) 
     * ```
     */
    setPlayer(player: Player): this {
        this.player = player
        this.track(this.world.collide(player))

        return this
    }

    /**
     * Registers a foe for world collisions and player touching damage detection.
     * 
     * If player is present also adds physical blocking and an overlap
     * that attempts contact damage. Removes the foe from tracked set when
     * its game object is destroyed.
     * 
     * @param foe - A single foe object to register
     * @returns The same foe instance
     * 
     */
    addFoe(foe: Foe): Foe {
        this.foes.add(foe)
        this.track(this.world.collide(foe))

        const player = this.player
        if (player) {
            this.track([
                this.scene.physics.add.overlap(player, foe, () => {
                    if (!foe.isDead) player.takeDamage(foe.contactDamage, foe)
                }),
                // alongside the overlap rather than instead of it - contact costs
                // health, and the two of them still can't stand in the same place
                this.scene.physics.add.collider(player, foe),
            ])
        }

        foe.once(Phaser.GameObjects.Events.DESTROY, () => this.foes.delete(foe))

        return foe
    }

    /**
     * Register a project for world collisions and player overlap.
     * 
     * Calls "strike()" to dispense and spent arrow.
     * 
     * @param projectile - Projectile to register.
     * @returns The same projectile instance.
     */
    addProjectile(projectile: Projectile): Projectile {
        this.track(this.world.collide(projectile, () => projectile.strike()))

        const player = this.player
        if (player) {
            this.track([
                this.scene.physics.add.overlap(player, projectile, () => {
                    if (!projectile.active) return

                    // the shooter is the source, not the arrow - being knocked back
                    // towards whoever fired it would read as being pulled in
                    player.takeDamage(projectile.damage, projectile.shooter)

                    // spent either way - an arrow stopped by i-frames still stops
                    projectile.strike()
                }),
            ])
        }

        return projectile
    }

    /**
     * Creates a zone from map object and watches for player overlap.
     * 
     * Despite it's name, `onEnter` runs every frame overlap is detected.
     * 
     * @param object - Map object to get a zone from by using WorldMap's `zone()` function
     * @param onEnter - Callback invoked while player overlaps the zone
     * @returns The created zone, or `null` if no player is registered
     */
    watchZone(object: MapObject, onEnter: () => void): Phaser.GameObjects.Zone | null {
        if (!this.player) return null

        const zone = this.world.zone(object)
        this.track([this.scene.physics.add.overlap(this.player, zone, onEnter)])

        return zone
    }

    /**
     * Resolve player and enemy meele attacks
     * run after entity updates in `GameScene.update()` so every swing lands on object's
     * new frame position, rather than previous one
     */
    update(): void {
        this.resolvePlayerSwing()
        this.resolveFoeSwings()
    }

    /**
     * Destroys tracked colliders, clears foes and nullifies player reference
     * 
     * Called after one time listener fires on scene shutdown.
     */
    destroy(): void {
        for (const collider of this.colliders) collider.destroy()

        this.colliders.length = 0
        this.foes.clear()
        this.player = null
    }

    /**
     * Resolve player's meele attack against registered foes.
     * Does nothing if player isn't registered.
     */
    private resolvePlayerSwing(): void {
        const player = this.player
        if (!player) return

        // the player is the source, so a foe knows which way to be knocked
        this.resolveSwing(player.getAttack, this.foes, foe => {
            foe.takeDamage(player.attackDamage, player)
        })
    }

    /**
     * Resolve every foes meele attack against player.
     * Does nothing if player is missing or dead.
     */
    private resolveFoeSwings(): void {
        const player = this.player
        // if player is dead, nothing left to hit
        if (!player || player.getHealth.isDead) return

        for (const foe of this.foes) {
            // pass player as an array of length === 1, because resolveSwing takes array as a parameter
            this.resolveSwing(foe.meleeAttack, [player], () => {
                player.takeDamage(foe.attackDamage, foe)
            })
        }
    }

    /**
     * Resolve meele attack against targets with enabled physics bodies.
     * 
     * Checks geometry before registering a hit. Calls `onHit()` only when
     * `registerHit()` accepts target, preventing repeated hits on the same
     * targets during one swing.
     * Does nothing if the swing or it's hit are is missing.
     * 
     * @param swing - Meele attack to get hit and hit area.
     * @param targets - Iterable type object of swing targets.
     * @param onHit - Callback invoked for every registered swing.
     */
    private resolveSwing<T extends Combatant>(
        swing: MeleeAttack | null,
        targets: Iterable<T>,
        onHit: (target: T) => void,
    ): void {
        // area of meele attack box
        const area = swing?.hitArea
        if (!swing || !area) return

        for (const target of targets) {
            const body = target.body as Phaser.Physics.Arcade.Body | null

            // a corpse mid-fade still has a sprite, but nothing left to hit - its
            // body is switched off the moment it collapses
            if (!body?.enable) continue

            this.targetBounds.setTo(body.x, body.y, body.width, body.height)
            if (!Phaser.Geom.Rectangle.Overlaps(area, this.targetBounds)) continue
            if (!swing.registerHit(target)) continue

            onHit(target)
        }
    }

    /**
     * Save registered collider handles for cleanup in `destroy()`
     *  
     * @param colliders - Handles to retain
     */
    private track(colliders: Phaser.Physics.Arcade.Collider[]): void {
        this.colliders.push(...colliders)
    }
}
