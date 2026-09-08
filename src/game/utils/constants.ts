import { HealthConfig } from "../components/HealthComponent"
import { MovementConfig } from "../components/MovementController"

export const SCALE_FACTOR:number = 2
export const UI_SCALE_FACTOR:number = 7

// every character sheet - the player and each equippable overlay - is cut to this
// grid. Equipment works by copying the player's frame index onto the item sprite,
// so the sheets must stay frame-for-frame aligned
export const CHARACTER_FRAME = { frameWidth: 80, frameHeight: 64 } as const
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

export interface MeleeAttackConfig {
    // how far into the swing the hit area opens, and how long it stays open -
    // the rest of the animation is windup and recovery, and hurts nobody
    windupMs: number,
    activeMs: number,
    // enforced after the swing ends, so a held button isn't a blender
    cooldownMs: number,
    // a press this far ahead of the swing being allowed still counts, so mashing
    // at the end of one swing flows into the next
    bufferMs: number,
    // the hit area in world pixels, measured out from the edge of the attacker's
    // body - a scaled sprite doesn't need this scaled with it
    width: number,
    height: number,
    offsetX: number,
    offsetY: number, // negative reaches above the attacker's middle
}

// tuned against the 6-frame swing in PLAYER_ANIMS.attack - the window opens
// around the frame the blade is out in front
export const PLAYER_ATTACK:MeleeAttackConfig = {
    windupMs: 180,
    activeMs: 260,
    cooldownMs: 140,
    bufferMs: 160,
    width: 44,
    height: 76,
    offsetX: 2,
    // the player's body is nearly a hundred pixels tall and a fox barely a third
    // of that, so the arc is pushed down to reach the things standing on the floor
    offsetY: 8,
}

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
    depth: number, // above everything in the world, the controls are never occluded
}

export const TOUCH_CONTROLS:TouchControlsConfig = {
    radius: 56,
    hitRadiusScale: 1.25,
    margin: 20,
    gap: 10,
    maxTouches: 3,
    pressedAlpha: 0.55,
    depth: 2000,
}

export interface ItemDefinition {
    // shown in menus and pickup prompts
    name: string,
    // overlay spritesheet, cut to CHARACTER_FRAME and aligned with the player's sheet
    texture: string,
    // damage a swing deals - tools hit for less than a weapon of the same tier
    damage: number,
}

export const ITEMS = {
    "diamond-sword": { name: "Diamond Sword", texture: "diamond-sword", damage: 25 },
    "diamond-axe": { name: "Diamond Axe", texture: "diamond-axe", damage: 18 },
    "diamond-pickaxe": { name: "Diamond Pickaxe", texture: "diamond-pickaxe", damage: 12 },
} as const satisfies Record<string, ItemDefinition>

// every id the player can be handed - a typo is a compile error, not a blank sprite
export type ItemId = keyof typeof ITEMS

// damage a bare-handed swing deals, when nothing is equipped
export const UNARMED_DAMAGE:number = 6

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

// every foe animates from at least these two - the states only ever ask for them
export type FoeAnims = {
    idle: AnimConfig,
    run: AnimConfig,
}

export interface FoeDefinition {
    name: string,
    texture: string,
    // the foe's own sheet grid - foes aren't cut to CHARACTER_FRAME
    frame: { frameWidth: number, frameHeight: number },
    anims: FoeAnims,
    // which way the art is drawn, so AnimationController knows when to mirror
    facing: 'left' | 'right',
    scale: number,
    // hitbox inside the frame, tighter than the art so contact feels fair
    body: { width: number, height: number, offsetX: number, offsetY: number },
    health: HealthConfig,
    speed: number, // patrol pace
    chaseSpeed: number,
    // how far it will wander either side of where it spawned
    patrolRange: number,
    // the beat it spends looking around at each end of a patrol
    pauseMs: number,
    aggroRange: number,
    // larger than aggroRange, so a target at the edge can't flicker the foe in and
    // out of the chase every frame
    deAggroRange: number,
    // how far above/below the foe still counts as reachable
    verticalReach: number,
    contactDamage: number,
    // shove the foe takes when hit, away from whatever hit it
    knockback: number,
    knockbackLift: number,
    deathFadeMs: number,
}

export const FOX_ANIMS = {
    // frame 5 is blank on the sheet, so idle stops at 4
    idle: { key: "fox-idle", start: 0, end: 4, frameRate: 6, repeat: -1 },
    run: { key: "fox-run", start: 6, end: 11, frameRate: 12, repeat: -1 },
} as const satisfies FoeAnims

export const FOES = {
    fox: {
        name: "Fox",
        texture: "fox",
        frame: { frameWidth: 32, frameHeight: 32 },
        anims: FOX_ANIMS,
        facing: 'right', // fox.png is drawn facing right, unlike the player sheet
        scale: SCALE_FACTOR,
        body: { width: 28, height: 18, offsetX: 2, offsetY: 13 },
        health: {
            max: 300,
            invulnerabilityMs: 250, // short, so a fast weapon still combos
            regenPerSecond: 0,
            regenDelayMs: 0,
        },
        speed: 45,
        chaseSpeed: 130,
        patrolRange: 140,
        pauseMs: 1400,
        aggroRange: 260,
        deAggroRange: 380,
        verticalReach: 80,
        contactDamage: 22,
        knockback: 180,
        knockbackLift: -120,
        deathFadeMs: 450,
    },
} as const satisfies Record<string, FoeDefinition>

export type FoeId = keyof typeof FOES

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
    // meele attack, meele action - locked so the walk cycle can't cut a swing
    // short, but below hurt and death, which are allowed to interrupt one
    attack: { key: "player-action", start: 50, end: 55, frameRate: 16, repeat: 0, priority: 5, lockUntilComplete: true },
} as const satisfies Record<string, AnimConfig>
