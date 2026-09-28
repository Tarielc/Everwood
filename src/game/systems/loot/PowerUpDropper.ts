import * as Phaser from 'phaser';
import { POWER_UP_DROP, POWER_UPS, PowerUpDefinition, PowerUpDropConfig, PowerUpId } from '../../data/powerUps';
import type PowerUp from '../../entities/PowerUp';

/** How the scene puts a rolled drop into the world - the dropper decides what, never how */
export type SpawnPowerUp = (id: PowerUpId, definition: PowerUpDefinition, x: number, y: number) => PowerUp

/**
 * Rolls for power up drops.
 *
 * Every landed hit gets one roll against `chance`; a win picks one of {@link POWER_UPS}
 * weighted by its `dropWeight`, and hands it to the scene to spawn. The dropper keeps
 * count of what it has out on the floor, so `maxAlive` holds however lucky the
 * streak.
 *
 * Like `WaveDirector` it builds nothing itself - the scene's spawn callback is what
 * gives the pickup its collisions.
 */
export class PowerUpDropper {
    /** what's lying on the floor right now, counted against `maxAlive` */
    private alive: number = 0

    /**
     * @param spawn - Puts a rolled drop into the world
     * @param config - Drop chance and cap
     * @param random - Source of randomness, `0..1` - swapped out to make a roll predictable
     */
    constructor(
        private readonly spawn: SpawnPowerUp,
        private readonly config: PowerUpDropConfig = POWER_UP_DROP,
        private readonly random: () => number = Math.random,
    ) {}

    /**
     * Roll for a drop at a spot - call once per landed hit.
     *
     * @param x - Where it drops from (world)
     * @param y - Where it drops from (world)
     * @returns the pickup that dropped, or `null` if the roll missed or the floor is full
     */
    roll(x: number, y: number): PowerUp | null {
        if (this.alive >= this.config.maxAlive) return null
        if (this.random() >= this.config.chance) return null

        const id = this.pick()
        if (!id) return null

        const pickup = this.spawn(id, POWER_UPS[id], x, y)

        this.alive++
        pickup.once(Phaser.GameObjects.Events.DESTROY, () => this.alive--)

        return pickup
    }

    /**
     * One power up id, weighted by `dropWeight`.
     *
     * @returns the id picked, or `null` if nothing has any weight
     */
    private pick(): PowerUpId | null {
        const entries = Object.entries(POWER_UPS) as [PowerUpId, PowerUpDefinition][]
        const total = entries.reduce((sum, [, definition]) => sum + definition.dropWeight, 0)
        if (total <= 0) return null

        let roll = this.random() * total
        for (const [id, definition] of entries) {
            roll -= definition.dropWeight
            if (roll < 0) return id
        }

        // floating point landing exactly on the total - the last one with any weight
        const weighted = entries.filter(([, definition]) => definition.dropWeight > 0)
        return weighted[weighted.length - 1]?.[0] ?? null
    }
}
