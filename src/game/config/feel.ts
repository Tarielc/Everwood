/**
 * How hard a blow lands - the hitstop and the camera shake that sell it.
 *
 * Both are authored per moment rather than per weapon: what a hit is worth is how
 * much of the target it took, not which item swung it, so a profile keeps reading
 * right however the damage numbers are balanced later.
 */

/** One moment of impact - what the world does the instant a blow connects */
export interface ImpactProfile {
    /** How long the whole world holds still afterwards, in ms. `0` for a hit with no hitstop at all */
    freezeMs: number
    /**
     * How hard the camera shakes, as a fraction of the viewport. Small floats - `0.01`
     * is already violent, and anything past that reads as a bug rather than a blow
     */
    shakeIntensity: number
    /** How long the shake runs, in ms - it rings out while the freeze holds */
    shakeMs: number
}

/** Every impact the game can land, each scaled by the size of the hit that caused it */
export const IMPACT = {
    /** a swing of the player's connecting with a foe - the one felt most often, so the lightest */
    foeHit: {
        freezeMs: 55,
        shakeIntensity: 0.0035,
        shakeMs: 110,
    },
    /** the player on the receiving end - hits harder than landing one, so a mistake is felt */
    playerHurt: {
        freezeMs: 90,
        shakeIntensity: 0.008,
        shakeMs: 220,
    },
    /** a foe going down. lands on top of the hit that killed it, which is what makes a kill read heavier than a hit */
    foeDeath: {
        freezeMs: 75,
        shakeIntensity: 0.006,
        shakeMs: 240,
    },
} as const satisfies Record<string, ImpactProfile>

/**
 * The longest the world can ever be held still, however many blows land at once.
 * A crowd all connecting on the same frame is still one freeze, not a stutter
 */
export const IMPACT_FREEZE_MAX_MS:number = 140

/** The share of a target's health a hit has to take for its profile to land exactly as authored */
export const IMPACT_REFERENCE_SHARE:number = 0.25

/** How far the size of a hit may push its impact either side of what the profile says */
export const IMPACT_SCALE = { min: 0.7, max: 1.6 } as const

/**
 * How big a hit was, as a multiplier for an {@link ImpactProfile}.
 *
 * Measured against the target rather than in raw damage, so a weapon twice as strong
 * lands twice as hard without every profile needing retuning behind it.
 *
 * @param amount - Health the hit moved - {@link HealthChange.amount}, negative for damage
 * @param max - The target's maximum health
 * @returns A multiplier clamped to {@link IMPACT_SCALE}
 */
export function impactScale(amount: number, max: number): number {
    if (max <= 0) return 1

    const scale = (Math.abs(amount) / max) / IMPACT_REFERENCE_SHARE
    return Math.min(Math.max(scale, IMPACT_SCALE.min), IMPACT_SCALE.max)
}
