import { HealthConfig } from "../components/HealthComponent"
import { MovementConfig } from "../components/MovementController"

export const SCALE_FACTOR:number = 2
export const UI_SCALE_FACTOR:number = 10

// every character sheet - the player and each equippable overlay - is cut to this
// grid. Equint works by copying the player's frame index onto the item sprite,
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
    cooldownMs: 240,
    bufferMs: 160,
    width: 54,
    height: 76,
    offsetX: -8,
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
    gap: 50,
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
    "diamond-sword": { name: "Diamond Sword", texture: "diamond-sword", damage: 150 },
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

// every foe animates from at least these two - the rest are optional, so a sheet
// that only has a walk cycle still works and the states fall back to a frame it has
export type FoeAnims = {
    idle: AnimConfig,
    run: AnimConfig,
    attack?: AnimConfig,
    hurt?: AnimConfig,
    death?: AnimConfig,
}

export interface ProjectileDefinition {
    // a single image rather than a sheet - a projectile is one frame
    texture: string,
    // flight speed in px/s, always along the direction it was fired
    speed: number,
    // arcade gravity applied to it - 0 flies flat, which is what an arrow does here
    gravity: number,
    scale: number,
    body: { width: number, height: number, offsetX: number, offsetY: number },
    // removed after this long, so a shot that hits nothing can't live forever
    lifetimeMs: number,
}

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

export type ProjectileId = keyof typeof PROJECTILES

// what every foe attack has, whatever shape it takes
interface FoeAttackBase {
    // how close the target has to be before the foe commits to one - always
    // shorter than aggroRange, so a foe closes the gap before it swings or shoots
    range: number,
    damage: number,
}

export interface FoeMeleeAttack extends FoeAttackBase {
    kind: "melee",
    // the swing's timing and reach, the same shape the player's swing uses -
    // bufferMs goes unused, a foe's swing is started by its state, not by a press
    swing: MeleeAttackConfig,
}

// a shot's timing and where it leaves from - the counterpart to
// MeleeAttackConfig, and like it, the same shape whoever is holding the weapon
export interface RangedAttackConfig {
    projectile: ProjectileDefinition,
    // what one costs whatever it lands on - unlike a swing, a shot carries its
    // damage with it rather than being charged for on contact
    damage: number,
    // how far into the animation the shot leaves - the frames either side are
    // the draw and the recovery, and neither of them hurts anybody
    windupMs: number,
    // waited out on top of however long the animation itself took
    cooldownMs: number,
    // where the shot leaves, measured from the centre of the shooter's body -
    // muzzleX is mirrored with its facing, muzzleY is not
    muzzleX: number,
    muzzleY: number,
}

// extends the config directly rather than nesting it, so a foe definition can
// be handed straight to RangedAttack
export interface FoeRangedAttack extends FoeAttackBase, RangedAttackConfig {
    kind: "ranged",
    // it won't close any nearer than this, so it keeps the room it needs to shoot
    standoff: number,
}

// a foe without one of these only ever has its body to hurt you with
export type FoeAttack = FoeMeleeAttack | FoeRangedAttack

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
    // how it fights once it's in range - left out, it just walks into you
    attack?: FoeAttack,
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

// warrior.png is cut to the same 80x64 grid as the player, one animation per row:
// idle, run, swing, flinch, and a ten-frame fall over
export const WARRIOR_ANIMS = {
    idle: { key: "warrior-idle", start: 0, end: 4, frameRate: 6, repeat: -1 },
    run: { key: "warrior-run", start: 10, end: 17, frameRate: 12, repeat: -1 },
    // 600ms of swing, the blade only out in front for the last two frames
    attack: { key: "warrior-attack", start: 20, end: 25, frameRate: 10, repeat: 0, priority: 5, lockUntilComplete: true },
    // outranks the swing, so a hit lands as a flinch instead of being swallowed by it
    hurt: { key: "warrior-hurt", start: 30, end: 31, frameRate: 5, repeat: 0, priority: 10, lockUntilComplete: true },
    death: { key: "warrior-death", start: 40, end: 49, frameRate: 10, repeat: 0, priority: 20, lockUntilComplete: true },
} as const satisfies FoeAnims

// archer.png is an 11-wide, 64x64 grid - the wider rows are what the extra
// columns are for, the shot alone runs eleven frames
export const ARCHER_ANIMS = {
    idle: { key: "archer-idle", start: 0, end: 4, frameRate: 6, repeat: -1 },
    run: { key: "archer-run", start: 22, end: 29, frameRate: 12, repeat: -1 },
    // the draw, the loose and the recovery, ~790ms end to end
    attack: { key: "archer-shoot", start: 11, end: 21, frameRate: 14, repeat: 0, priority: 5, lockUntilComplete: true },
    hurt: { key: "archer-hurt", start: 33, end: 37, frameRate: 12, repeat: 0, priority: 10, lockUntilComplete: true },
    death: { key: "archer-death", start: 44, end: 49, frameRate: 10, repeat: 0, priority: 20, lockUntilComplete: true },
} as const satisfies FoeAnims

// tuned against WARRIOR_ANIMS.attack - the window opens on the two frames the
// slash is drawn on, and shuts as the animation ends
export const WARRIOR_SWING:MeleeAttackConfig = {
    windupMs: 180,
    activeMs: 260,
    // on top of the 600ms the animation itself takes, so there's a beat between swings
    cooldownMs: 450,
    bufferMs: 0, // unused - a foe's swing is started by its state, never queued
    width: 46,
    height: 70,
    offsetX: 2,
    offsetY: 6,
}

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
            max: 100,
            invulnerabilityMs: 250, // short, so a fast weapon still combos
            regenPerSecond: 0,
            regenDelayMs: 0,
        },
        speed: 45,
        chaseSpeed: 100,
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
    // a swordsman built on the player's own sheet - slower than the player, but
    // it hits nearly as hard and takes eight sword blows to put down
    warrior: {
        name: "Warrior",
        texture: "warrior",
        frame: CHARACTER_FRAME,
        anims: WARRIOR_ANIMS,
        facing: 'left', // drawn facing left, the same way the player sheet is
        scale: SCALE_FACTOR,
        // the same footprint the player has in this grid, minus the sword arm
        body: { width: 16, height: 44, offsetX: 32, offsetY: 20 },
        health: {
            max: 200,
            invulnerabilityMs: 300,
            regenPerSecond: 0,
            regenDelayMs: 0,
        },
        speed: 55,
        chaseSpeed: 150,
        patrolRange: 160,
        pauseMs: 1200,
        aggroRange: 300,
        deAggroRange: 420,
        verticalReach: 90,
        // nothing - the sword is what hurts, and body contact would only spend the
        // player's i-frames on a hit the swing was about to land
        contactDamage: 0,
        attack: {
            kind: "melee",
            // just inside the swing's reach, so it commits rather than nudging closer
            range: 76,
            damage: 25,
            swing: WARRIOR_SWING,
        },
        knockback: 40, // heavy, so it barely staggers
        knockbackLift: -20,
        deathFadeMs: 600,
    },
    // fragile, and no threat at all once you're stood next to it - it backs off to
    // its standoff distance rather than let you close, and shoots from out there
    archer: {
        name: "Archer",
        texture: "archer",
        frame: { frameWidth: 64, frameHeight: 64 },
        anims: ARCHER_ANIMS,
        facing: 'right', // the bow is on its right and the arrow leaves that way
        scale: SCALE_FACTOR,
        // the art sits left of centre in its frame - Foe mirrors this offset with
        // the sprite, so the hitbox stays on the archer rather than on its bow
        body: { width: 20, height: 43, offsetX: 15, offsetY: 21 },
        health: {
            max: 120,
            invulnerabilityMs: 250,
            regenPerSecond: 0,
            regenDelayMs: 0,
        },
        speed: 40,
        chaseSpeed: 110,
        patrolRange: 120,
        pauseMs: 1500,
        // it spots you from further off than anything else, which is the whole point
        aggroRange: 440,
        deAggroRange: 540,
        verticalReach: 90,
        contactDamage: 0,
        attack: {
            kind: "ranged",
            range: 400,
            damage: 16,
            projectile: PROJECTILES.arrow,
            // the frame the arrow leaves the bow, eight frames into the eleven
            windupMs: 570,
            cooldownMs: 900,
            standoff: 200,
            // out at the bow, roughly level with the archer's hands
            muzzleX: 22,
            muzzleY: -6,
        },
        knockback: 200,
        knockbackLift: -140,
        deathFadeMs: 600,
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

// ---------------------------------------------------------------------------
// World map
// ---------------------------------------------------------------------------

// the map is drawn at the same scale the characters standing on it are, so a
// 32px tile and the player's art stay in proportion. everything the map hands
// back - spawn points, object markers - is already multiplied by this, so the
// rest of the game only ever deals in world pixels
export const MAP_SCALE:number = SCALE_FACTOR

export interface LevelDefinition {
    // the Tiled export, under public/. everything else about a level - where it
    // starts, what stands in it, where it lets out - is authored into the map
    // itself rather than repeated here
    url: string,
}

// every map the game can be standing in. the id is both the key the map json is
// cached under and the name a level transition uses, so adding a location is an
// entry here plus a `level` property on the exit that leads to it
export const LEVELS = {
    everwood: { url: "assets/map/map.json" },
} as const satisfies Record<string, LevelDefinition>

// every map the game can ask for - a typo is a compile error, not a blank scene
export type LevelId = keyof typeof LEVELS

// where a fresh game begins
export const STARTING_LEVEL:LevelId = "everwood"

export const MAP = {
    // the tileset sheets and the backdrops sit next to the maps that name them,
    // and are queued off the map data rather than listed by hand. two levels
    // sharing a sheet share the one texture, because a sheet is keyed by its
    // filename rather than by the tileset name a given map gave it
    assetPath: "assets/map/",
    scale: MAP_SCALE,
    // the per-tile property Tiled marks solid tiles with. Tiled will happily
    // write it as a bool or a string depending on how the field was authored,
    // so both spellings count
    collisionProperty: "collides",
    collisionValues: [true, "true"],
    objectLayers: {
        player: "Player Object Layer",
        enemies: "EnemyObjectsLayer",
        npcs: "NPC Objects",
        decor: "Decor Objects",
    },
    // depth custom property for optimal dynamic map loading
    depthProperty: "depth",

    // markers on the player layer - where a level starts and where it lets out
    spawnMarker: "PlayerStartPoint",
    exitType: "PlayerExitpoint",
    // which level the exit leads to, named on the exit object in Tiled. a map
    // whose exit doesn't name one is simply the end of the line
    exitLevelProperty: "nextLevel",
    // an object on the NPC layer becomes a foe when Tiled gives it this type;
    // which foe comes from its `enemyType` property, or failing that its name
    foeType: "Foe",
    foeTypeProperty: "foeType",
} as const

export interface ParallaxConfig {
    // how much of the camera's movement the backdrop follows - 0 is painted on
    // the lens and 1 is nailed to the world. vertical scroll is deliberately
    // left at 1: these are drawn to sit on the horizon, and sliding them up
    // would show what's underneath them
    scrollFactorX: number,
    depth: number,
}

// fallback depth in case it's not provided
export const MAP_DEFAULT_BACKDROP_DEPTH:number = -90

// where a tile layer lands when the table above doesn't name it - behind the
// ground and in front of the backdrops, which is where new decor belongs
export const MAP_DEFAULT_LAYER_DEPTH:number = -40

export interface CameraFollowConfig {
    // how hard the camera pulls towards the player each frame, per axis
    lerpX: number,
    lerpY: number,
    // shifts the camera off the player, positive being up. the ground is near
    // the bottom of this map and everything under it is solid fill, so the view
    // is lifted to trade that dirt for the sky and the treeline above it
    offsetY: number,
}

export const MAP_CAMERA:CameraFollowConfig = {
    lerpX: 0.12,
    lerpY: 0.08,
    offsetY: 90,
}
