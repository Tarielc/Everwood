import { SCALE_FACTOR } from "../config/display"

/** A single projectile type */
export interface ProjectileDefinition {
    /** A texture for a projectile */
    texture: string,
    /** Flight speed in px/s, always along the direction it was fired */
    speed: number,
    /** Arcade gravity applied to it - 0 flies flat */
    gravity: number,
    scale: number,
    body: { width: number, height: number, offsetX: number, offsetY: number },
    /** Removed after this time, so a shot that hits nothing can't live forever */
    lifetimeMs: number,
}

/** Every projectile in the game, keyed by {@link ProjectileId} */
export const PROJECTILES = {
    // arrow.png is drawn pointing right, so a shot travelling left is mirrored
    arrow: {
        texture: "arrow",
        speed: 430,
        gravity: 0,
        scale: SCALE_FACTOR,
        body: { width: 26, height: 5, offsetX: 2, offsetY: 0 },
        lifetimeMs: 2200,
    },
} as const satisfies Record<string, ProjectileDefinition>

/** Keys of {@link PROJECTILES} */
export type ProjectileId = keyof typeof PROJECTILES
