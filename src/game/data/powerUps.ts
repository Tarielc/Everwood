import { SCALE_FACTOR } from "../config/display"
import type { StatModifier } from "../components/StatusEffectComponent"
import type { SoundId } from "./audio"

/** A single power up - what it looks like on the floor, and what picking it up does */
export interface PowerUpDefinition {
    /** Shown in the pickup callout and on the HUD */
    name: string,
    /** Image under `assets/sprites/`, one frame */
    texture: string,
    /** How long the effect lasts once picked up - picking up another of the same kind starts it over */
    durationMs: number,
    /** What it does to the stats while it lasts, applied through `StatusEffectComponent` */
    modifiers: readonly StatModifier[],
    /** Relative odds of this one being the drop, against every other entry's weight */
    dropWeight: number,
    /** Colour of the pickup callout and the HUD timer */
    tint: number,
}

/** Every power up in the game, keyed by {@link PowerUpId} */
export const POWER_UPS = {
    "damage-increase": {
        name: "Damage Up",
        texture: "powerUp-damage-increase",
        durationMs: 10000,
        modifiers: [{ stat: "damage", op: "multiply", value: 1.5 }],
        dropWeight: 2,
        tint: 0xFF6A3D,
    },
    "speed-increase": {
        name: "Speed Up",
        texture: "powerUp-speed-increase",
        durationMs: 10000,
        modifiers: [{ stat: "speed", op: "multiply", value: 1.35 }],
        dropWeight: 2,
        tint: 0x5BC0EB,
    },
    // 6 hp a second for 8 seconds is 48 - just over a third of the player's bar
    "regeneration": {
        name: "Regeneration",
        texture: "powerUp-regeneration",
        durationMs: 8000,
        modifiers: [{ stat: "regen", op: "add", value: 6 }],
        dropWeight: 2,
        tint: 0x3CFF5A,
    },
} as const satisfies Record<string, PowerUpDefinition>

/** Keys of {@link POWER_UPS} - a typo is a compile error, not a blank pickup */
export type PowerUpId = keyof typeof POWER_UPS

/** When a power up drops, and how it behaves on the floor */
export interface PowerUpDropConfig {
    /** Chance each landed hit on a foe has of dropping one, 0..1 */
    chance: number,
    /** Most pickups lying around at once - a lucky streak can't carpet the floor */
    maxAlive: number,
    /** How long one waits on the floor before disappearing */
    lifetimeMs: number,
    /** How long after dropping before it can be picked up - so a hit doesn't hand it straight over */
    pickupDelayMs: number,
    /** The last stretch of its lifetime it spends blinking, so the player knows it's going */
    warnMs: number,
    /** The hop it makes out of the foe - up, and a little to either side */
    popVelocityY: number,
    popVelocityX: number,
    /** How far it bobs once it has landed, and how long one bob takes */
    bobHeight: number,
    bobMs: number,
    scale: number,
    /** What picking one up sounds like */
    pickupSound: SoundId,
}

/** Default drop configuration */
export const POWER_UP_DROP: PowerUpDropConfig = {
    chance: 0.2,
    maxAlive: 3,
    lifetimeMs: 12000,
    pickupDelayMs: 600,
    warnMs: 3000,
    popVelocityY: -220,
    popVelocityX: 60,
    bobHeight: 3,
    bobMs: 700,
    scale: SCALE_FACTOR,
    pickupSound: "power-up-pickup",
}
