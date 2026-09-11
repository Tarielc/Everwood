import * as Phaser from 'phaser';

import Foe from '../../entities/Foe';
import Player from '../../entities/Player';
import Projectile from '../../entities/Projectile';
import { Attackable, MeleeAttack } from '../../components/MeleeAttack';
import { MapObject, WorldMap } from '../world/WorldMap';

// anything a swing can be resolved against: a body to measure the reach against,
// and a way of being told it was hit. the player and a foe both satisfy this
// without being related to one another
interface Combatant extends Attackable {
    takeDamage(amount: number, source?: unknown): boolean
}

/**
 * Who can hit what. Everything that decides a body is stopped, a hit lands, or a
 * trigger fired lives here - the entities only ever announce what they did, and
 * the scene only says which of them are in the world.
 *
 * Two kinds of contact are handled, because the game has two. Arcade's own
 * colliders and overlaps are registered as things are spawned and then run
 * themselves; the melee swings own no physics body at all, so they're resolved
 * by hand from update(), once everything has finished moving for the frame.
 */
export class CollisionManager {

    private player: Player | null = null

    // the swing candidates, kept because resolving a swing means testing every
    // one of them. a destroyed foe drops itself out, so a caller registers one
    // and never has to take it back off
    private readonly foes = new Set<Foe>()

    // everything registered through here, so it can all be taken down in one go
    private readonly colliders: Phaser.Physics.Arcade.Collider[] = []

    // reused - resolving a swing shouldn't allocate a rectangle per target per frame
    private readonly targetBounds: Phaser.Geom.Rectangle = new Phaser.Geom.Rectangle()

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly world: WorldMap,
    ) {
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this)
    }

    // the player is what everything else is registered against, so it goes in
    // first - a foe added before one has nobody to walk into
    setPlayer(player: Player): this {
        this.player = player
        this.track(this.world.collide(player))

        return this
    }

    /**
     * Bring a foe into the collision world: stopped by the level, blocked by the
     * player, and hurting them on contact.
     *
     * The overlap fires every frame the two are touching - takeDamage() ignores
     * the hits that land during i-frames, which is what paces contact damage.
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
     * Give a shot in flight something to land on. A projectile is spent by
     * whatever stopped it, and the level stops one exactly the way the player
     * does - it just doesn't cost anybody anything.
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
     * Call `onEnter` while the player is stood on a marker from the map - an
     * exit, or anything else a level wants to trigger on.
     *
     * It fires every frame of the overlap rather than once, because what that
     * ought to mean belongs to whoever asked: an exit takes the first one and
     * ignores the rest, something else may well want all of them.
     */
    watchZone(object: MapObject, onEnter: () => void): Phaser.GameObjects.Zone | null {
        if (!this.player) return null

        const zone = this.world.zone(object)
        this.track([this.scene.physics.add.overlap(this.player, zone, onEnter)])

        return zone
    }

    // run last in the frame, so every swing lands against where things actually
    // ended up rather than where they started it
    update(): void {
        this.resolvePlayerSwing()
        this.resolveFoeSwings()
    }

    destroy(): void {
        for (const collider of this.colliders) collider.destroy()

        this.colliders.length = 0
        this.foes.clear()
        this.player = null
    }

    // the player's swing reaches for every foe in the world
    private resolvePlayerSwing(): void {
        const player = this.player
        if (!player) return

        // the player is the source, so a foe knows which way to be knocked
        this.resolveSwing(player.getAttack, this.foes, foe => {
            foe.takeDamage(player.attackDamage, player)
        })
    }

    // the mirror of it - a melee foe's swing reaches for the player, and its own
    // registerHit() keeps one swing to one hit
    private resolveFoeSwings(): void {
        const player = this.player
        if (!player || player.getHealth.isDead) return

        for (const foe of this.foes) {
            // the foe is the source, so the player is knocked away from it
            this.resolveSwing(foe.meleeAttack, [player], () => {
                player.takeDamage(foe.attackDamage, foe)
            })
        }
    }

    /**
     * One swing against everything it could reach. The geometry is the same
     * whoever is swinging - what differs is who counts as a target and what a
     * hit costs them, and both of those are the caller's to say.
     *
     * registerHit() is what stops one swing landing on the same target twice, so
     * it's asked last: a target the reach missed was never hit to begin with.
     */
    private resolveSwing<T extends Combatant>(
        swing: MeleeAttack | null,
        targets: Iterable<T>,
        onHit: (target: T) => void,
    ): void {
        // null outside the frames that actually hurt, so a windup or a recovery
        // has nothing to test
        const area = swing?.hitArea
        if (!swing || !area) return

        // a target that dies to its hit leaves the set mid-loop, which is why the
        // foes are held in one - removing the element being visited can't shuffle
        // the ones still to come, the way splicing an array would
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

    // hold on to what was registered, so destroy() can take it all back down
    private track(colliders: Phaser.Physics.Arcade.Collider[]): void {
        this.colliders.push(...colliders)
    }
}
