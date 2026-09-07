import { HealthConfig } from "../components/HealthComponent"
import { MovementConfig } from "../components/MovementController"

export const SCALE_FACTOR:number = 2
export const UI_SCALE_FACTOR:number = 7
export const PLAYER_MOVEMENT:MovementConfig = {
    speed: 110,
    sprintSpeed: 225,
    acceleration: 900,
    drag: 700,
    jumpVelocity: -320,
    jumpCutMultiplier: 0.5,
    gravity: 100,
    fallGravityMultiplier: 1.5,
    coyoteTimeMs: 100,
    jumpBufferMs: 120,
    maxFallSpeed: 600,
}
// prefix the player's health events carry on the global EventBus, e.g. "player:health-changed"
// - shared so the entity that emits and the HUD that listens can't drift apart
export const PLAYER_HEALTH_BUS:string = "player"
export const PLAYER_HEALTH:HealthConfig = {
    max: 100,
    invulnerabilityMs: 700, // roughly the length of the hurt animation
    regenPerSecond: 5, // out-of-combat regen is off for now
    regenDelayMs: 4000,
}
// i-frames the player respawns with, long enough to walk away from whatever killed them
export const PLAYER_RESPAWN_INVULNERABILITY_MS:number = 1500

export interface HealthBarConfig {
    // where the HUD sits in the corner, before UI scaling
    x: number,
    y: number,
    scale: number,
    depth: number,
    // each fill's offset inside the frame image, in unscaled texture pixels
    health: { x: number, y: number },
    stamina: { x: number, y: number },
    mana: { x: number, y: number },
    // how long a fill takes to slide to its new value
    tweenMs: number,
    // the fill flashes this colour when health drops
    damageFlash: number,
    damageFlashMs: number,
}

export const HEALTH_BAR:HealthBarConfig = {
    x: 20,
    y: 20,
    scale: 2,
    depth: 1000,
    health: { x: 4, y: 4 },
    stamina: { x: 66, y: 47 },
    mana: { x: 63, y: 54 },
    tweenMs: 220,
    damageFlash: 0xffffff,
    damageFlashMs: 90,
}
export interface TouchControlsConfig {
    radius: number,
    hitRadiusScale: number, // forgiving hit area, larger than the drawn circle
    margin: number,
    gap: number,
    maxTouches: number,
    pressedAlpha: number,
}

export const TOUCH_CONTROLS:TouchControlsConfig = {
    radius: 56,
    hitRadiusScale: 1.25,
    margin: 20,
    gap: 10,
    maxTouches: 3,
    pressedAlpha: 0.55,
}

export interface AnimConfig {
    key: string,
    start: number,
    end: number,
    frameRate: number,
    repeat: number,
    yoyo?: boolean,
    // defaults used by AnimationController when play() doesn't override them
    priority?: number, // higher priority interrupts a locked animation
    lockUntilComplete?: boolean, // don't let other animations cut this one short
}

export const PLAYER_ANIMS = {
    idle: { key: "player-idle", start: 0, end: 4, frameRate: 8, repeat: -1 },
    walk: { key: "player-walk", start: 10, end: 17, frameRate: 14, repeat: -1 },
    sprint: { key: "player-sprint", start: 20, end: 27, frameRate: 14, repeat: -1 },
    jump: { key: "player-jump", start: 30, end: 33, frameRate: 12, repeat: 0 },
    fall: { key: "player-fall", start: 40, end: 43, frameRate: 8, repeat: -1 },
    // hurt and death outrank the movement animations, and hold their frames to the
    // end so a flinch can't be cut short by the walk cycle resuming underneath it
    hurt: { key: "player-hurt", start: 60, end: 61, frameRate: 8, repeat: 0, priority: 10, lockUntilComplete: true },
    death: { key: "player-death", start: 60, end: 69, frameRate: 8, repeat: 0, priority: 20, lockUntilComplete: true },
} as const satisfies Record<string, AnimConfig>
