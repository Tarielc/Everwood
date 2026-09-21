import * as Phaser from 'phaser';

import { HealthEvent } from '../../components/HealthComponent';
import { FOES, FoeDefinition } from '../../data/foes';
import { WaveConfig, WaveFoeRule } from '../../data/waves';
import Foe from '../../entities/Foe';
import { FootPoint } from '../world/WorldMap';

/** What a director tells the scene about, so a HUD can follow the run without polling it */
export const WaveEvent = {
    /** A wave has begun - handed its number, counting from 1, and how many foes are in it */
    Started: "wave-started",
    /** The last foe of a wave went down - handed the number of the wave just cleared */
    Cleared: "wave-cleared",
} as const

/**
 * How the scene brings a foe into the world.
 *
 * The director decides what arrives and when; standing it on the floor, colliding it
 * and pointing it at the player is the scene's business, the same as it is for a foe
 * the map placed by hand
 */
export type SpawnFoe = (definition: FoeDefinition, at: FootPoint) => Foe

/**
 * Endless escalating foe waves for one level.
 *
 * A wave is planned from a {@link WaveConfig} rather than authored, so the run has no
 * end: each one brings more foes than the last, and each foe a little more health and
 * damage than the same foe carried a wave ago. The director deals them out across the
 * map's spawn points, counts them down as they die, and sends in the next wave once
 * the floor is clear.
 *
 * Nothing here knows what a foe is beyond something that can die - {@link spawn} makes
 * them and the scene owns them, which is why a level change or a player death can
 * simply {@link stop} the run and leave everything else standing.
 */
export class WaveDirector extends Phaser.Events.EventEmitter {
    /** Which wave is on the floor - `0` until the first one lands */
    private waveNumber: number = 0

    /** Foes of the current wave still standing */
    private readonly standing = new Set<Foe>()

    /** Foes of the current wave whose turn to arrive hasn't come round yet */
    private queued: number = 0

    /** `false` once the run is stopped - every pending timer checks it before firing */
    private running: boolean = false

    /** Every timer in flight, so stopping the run takes its future with it */
    private readonly timers: Phaser.Time.TimerEvent[] = []

    /**
     * @param scene - Scene the waves are fought in
     * @param config - What arrives, how fast, and how hard it scales
     * @param points - Where foes come in, in world pixels - a wave is dealt round them in turn
     * @param spawn - How the scene puts a foe in the world
     */
    constructor(
        private readonly scene: Phaser.Scene,
        private readonly config: WaveConfig,
        private readonly points: FootPoint[],
        private readonly spawn: SpawnFoe,
    ) {
        super()
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this)
    }

    /** Which wave is being fought, counting from 1 - `0` before the first one lands */
    get wave(): number {
        return this.waveNumber
    }

    /** How many foes of the current wave are left, counting the ones still to arrive */
    get remaining(): number {
        return this.standing.size + this.queued
    }

    /** `true` while waves are still coming */
    get isRunning(): boolean {
        return this.running
    }

    /** wave object configuration */
    get waveConfig(): WaveConfig {
        return this.config
    }

    /** Open the run - the first wave lands after `openingDelayMs` */
    start(): void {
        if (this.running) return

        this.running = true
        this.after(this.config.openingDelayMs, () => this.beginWave())
    }

    /**
     * Call the run off. Foes already on the floor are left where they are - they belong
     * to the scene, which is either about to restart or has its own reason for stopping
     */
    stop(): void {
        this.running = false

        for (const timer of this.timers) timer.remove()
        this.timers.length = 0

        this.standing.clear()
        this.queued = 0
    }

    /** Destructor and cleanup - runs itself on scene shutdown */
    destroy(): void {
        this.stop()
        super.destroy()
    }

    /**
     * Plan the next wave and start letting it in.
     *
     * Foes are dealt round the spawn points in turn off an already shuffled plan, so
     * neither the order they arrive in nor the side they come from repeats.
     */
    private beginWave(): void {
        if (!this.running) return

        this.waveNumber += 1
        const plan = planWave(this.config, this.waveNumber)

        // a wave with nothing in it could never be cleared - sit it out rather than
        // leave the run waiting on a foe that is never coming
        if (plan.length === 0) {
            this.after(this.config.breakMs, () => this.beginWave())
            return
        }

        this.queued = plan.length
        this.emit(WaveEvent.Started, this.waveNumber, plan.length)

        plan.forEach((definition, index) => {
            const at = this.points[index % this.points.length]
            this.after(this.config.spawnIntervalMs * index, () => this.release(definition, at))
        })
    }

    /**
     * Put one foe of the current wave on the floor and start watching for it to go down
     *
     * @param definition - Foe to spawn, already scaled to this wave
     * @param at - Spawn point it walks in at
     */
    private release(definition: FoeDefinition, at: FootPoint): void {
        if (!this.running) return

        const foe = this.spawn(definition, at)
        this.queued -= 1
        this.standing.add(foe)

        // counted out on death rather than when the corpse finishes fading, so the
        // breather starts the moment the last one goes down
        foe.getHealth.once(HealthEvent.Died, () => this.retire(foe))
        // and on whatever else takes a foe out of the world - a wave can't be left
        // waiting on something that is no longer there to die
        foe.once(Phaser.GameObjects.Events.DESTROY, () => this.retire(foe))
    }

    /**
     * Drop a foe from the wave's count, and send in the next wave if it was the last one
     *
     * @param foe - Foe that died, or left the world some other way
     */
    private retire(foe: Foe): void {
        // both its death and its destruction report it - whichever lands first counts
        if (!this.standing.delete(foe)) return
        if (!this.running || this.queued > 0 || this.standing.size > 0) return

        // heal the player
        this.emit(WaveEvent.Cleared, this.waveNumber)
        this.after(this.config.breakMs, () => this.beginWave())
    }

    /**
     * Run something later, on a timer the run can take back
     *
     * @param delayMs - How long to wait
     * @param run - What to do once it is up
     */
    private after(delayMs: number, run: () => void): void {
        const timer = this.scene.time.delayedCall(Math.max(0, delayMs), () => {
            this.timers.splice(this.timers.indexOf(timer), 1)
            run()
        })

        this.timers.push(timer)
    }
}

/**
 * Everything one wave is made of, in the order it arrives
 *
 * @param config - The level's wave config
 * @param wave - Which wave to plan, counting from 1
 * @returns A definition per foe, scaled to the wave and shuffled
 */
function planWave(config: WaveConfig, wave: number): FoeDefinition[] {
    const health = growth(config.healthGrowth, wave, config.statCeiling)
    const damage = growth(config.damageGrowth, wave, config.statCeiling)

    const plan: FoeDefinition[] = []

    for (const rule of config.roster) {
        // scaled once per foe type - a definition is only ever read, so every fox
        // of a wave can share the one
        const definition = scaleFoe(FOES[rule.foe], health, damage)

        for (let count = countFor(rule, wave); count > 0; count--) plan.push(definition)
    }

    return Phaser.Utils.Array.Shuffle(plan)
}

/**
 * How many of one foe a wave asks for
 *
 * @param rule - Roster entry being counted
 * @param wave - Which wave, counting from 1
 * @returns The count - `0` before the foe's first wave
 */
function countFor(rule: WaveFoeRule, wave: number): number {
    if (wave < rule.firstWave) return 0

    const count = rule.baseCount + rule.countPerWave * (wave - rule.firstWave)
    return Phaser.Math.Clamp(Math.floor(count), 0, rule.maxCount)
}

/**
 * What a stat is multiplied by this deep into the run
 *
 * @param perWave - Fraction added per wave
 * @param wave - Which wave, counting from 1
 * @param ceiling - The most it is ever multiplied by
 * @returns A multiplier, `1` on the first wave
 */
function growth(perWave: number, wave: number, ceiling: number): number {
    return Math.min(1 + perWave * (wave - 1), ceiling)
}

/**
 * A foe as this wave fields it - the one from {@link FOES}, only tougher.
 *
 * Everything about a foe that isn't a number is left alone, so a scaled warrior is
 * still the warrior: same sheet, same reach, same pace. Only what it can take and
 * what it can deal move.
 *
 * @param definition - The foe as its data file writes it
 * @param health - Multiplier for its max health
 * @param damage - Multiplier for its contact and attack damage
 * @returns A scaled copy, or the definition itself when there is nothing to scale
 */
function scaleFoe(definition: FoeDefinition, health: number, damage: number): FoeDefinition {
    // the first wave is the foe exactly as it is written - no copy, no rounding
    if (health === 1 && damage === 1) return definition

    return {
        ...definition,
        health: { ...definition.health, max: Math.round(definition.health.max * health) },
        contactDamage: Math.round(definition.contactDamage * damage),
        attack: definition.attack && {
            ...definition.attack,
            damage: Math.round(definition.attack.damage * damage),
        },
    }
}
