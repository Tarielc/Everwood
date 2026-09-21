import type { FoeId } from "./foes"

/**
 * How many of one foe a wave asks for, and how that count grows as the waves go on.
 *
 * A rule is read per wave rather than per level, so a roster of three of these
 * describes an endless run: what shows up early, what joins later, and how thick
 * each of them eventually gets.
 */
export interface WaveFoeRule {
    foe: FoeId,
    /** The first wave this foe turns up in - it is absent from every wave before it */
    firstWave: number,
    /** How many arrive on that first wave */
    baseCount: number,
    /**
     * Added to the count for each wave after {@link firstWave}. Fractional, and the
     * total is floored - `0.5` is one more every second wave
     */
    countPerWave: number,
    /** Ceiling on the count, so one foe can't crowd an arena out on its own */
    maxCount: number,
}

/**
 * Endless escalating waves for a level.
 *
 * A wave gets harder in two ways: {@link roster} brings more of them, and
 * {@link healthGrowth}/{@link damageGrowth} make each one tougher than the same
 * foe was a wave ago. Both are capped, so wave fifty is a hard fight rather than
 * an impossible one.
 */
export interface WaveConfig {
    /** What the level can spawn, and how much of it, wave by wave */
    roster: WaveFoeRule[],
    /** Quiet beat between the level loading and the first wave arriving */
    openingDelayMs: number,
    /** Breather between a wave being cleared and the next one arriving */
    breakMs: number,
    /** Gap between each foe of a wave arriving, so a wave walks in rather than popping in */
    spawnIntervalMs: number,
    /** Fraction added to a foe's max health per wave, on top of what its definition prints */
    healthGrowth: number,
    /** The same, for contact and attack damage */
    damageGrowth: number,
    /** However many waves deep, nothing is ever more than this many times its printed health or damage */
    statCeiling: number,
}

/**
 * The arena's waves - foxes to open with, archers to make standing still cost
 * something, and warriors once the player has had a moment to settle in
 */
export const ARENA_WAVES:WaveConfig = {
    roster: [
        { foe: "fox", firstWave: 1, baseCount: 2, countPerWave: 0.7, maxCount: 0 },
        { foe: "archer", firstWave: 1, baseCount: 1, countPerWave: 0.4, maxCount: 4 },
        { foe: "warrior", firstWave: 2, baseCount: 1, countPerWave: 0.35, maxCount: 4 },
    ],
    // long enough to find your feet and see where the spawns are
    openingDelayMs: 2000,
    breakMs: 3000,
    spawnIntervalMs: 650,
    healthGrowth: 0.08,
    damageGrowth: 0.05,
    statCeiling: 2.5,
}
