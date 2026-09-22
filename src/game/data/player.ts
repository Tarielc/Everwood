import { MeleeAttackConfig } from "../components/attack/MeleeAttack"
import type { HealthConfig } from "../components/HealthComponent"
import type { MovementConfig } from "../components/MovementController"

/** Player movement tuning */
export const PLAYER_MOVEMENT:MovementConfig = {
    speed: 110,
    sprintSpeed: 225,
    acceleration: 900,
    drag: 700,
    jumpVelocity: -230,
    jumpCutMultiplier: 0.7,
    gravity: 100,
    fallGravityMultiplier: 1.5,
    coyoteTimeMs: 100,
    jumpBufferMs: 120,
    maxFallSpeed: 600,
}

/** Player physics body */
export const PLAYER_BODY = {
    width: 14,
    height: 46,
    offsetX: 33,
    offsetY: 18,
}

/**
 * Player health events prefix for global `EventBus`, e.g. `"player:health-changed"`.
 * Shared so the entity that emits and the HUD that listens can't drift apart
 */
export const PLAYER_HEALTH_BUS:string = "player"

/** Player health configuration */
export const PLAYER_HEALTH:HealthConfig = {
    max: 100,
    invulnerabilityMs: 700, // roughly the length of the hurt animation
    regenPerSecond: 4,
    regenDelayMs: 12000,
}

/**
 * How long a hit stuns the player - input is ignored until it runs out (and the
 * hurt animation has finished). Kept below `PLAYER_HEALTH.invulnerabilityMs`
 * so the player always gets a moment to act before they can be hit again
 */
export const PLAYER_HURT_STUN_MS:number = 300

/** I-frames the player respawns with, long enough to walk away from whatever killed them */
export const PLAYER_RESPAWN_INVULNERABILITY_MS:number = 1500

/**
 * Player melee swing, tuned against the 6-frame `PLAYER_ANIMS.attack` - the window
 * opens around the frame the blade is out in front
 */
export const PLAYER_UNARMED_ATTACK:MeleeAttackConfig = {
    windupMs: 180,
    activeMs: 260,
    cooldownMs: 240,
    bufferMs: 160,
    width: 18,
    height: 64,
    offsetX: -8,
    // the player's body is nearly a hundred pixels tall and a fox barely a third
    // of that, so the arc is pushed down to reach things standing on the floor
    offsetY: 8,
}
