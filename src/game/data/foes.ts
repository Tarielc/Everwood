import type { HealthConfig } from "../components/HealthComponent"
import { MeleeAttackConfig } from "../components/attack/MeleeAttack"
import type { RangedAttackConfig } from "../components/attack/RangedAttack"
import { CHARACTER_FRAME, ENEMY_FRAME_128, ENEMY_FRAME_64, SCALE_FACTOR } from "../config/display"
import type { FoeSounds } from "./audio"
import { ARCHER_ANIMS, BURNING_SKULL_ANIMS, FEMALE_DAMNED_ANIMS, FoeAnims, INFERNAM_SKULL_ANIMS, MALE_DAMNED_ANIMS, WARRIOR_ANIMS } from "./animations"
import { PROJECTILES } from "./projectiles"

/** What every foe attack has, whatever shape it takes */
interface FoeAttackBase {
    /**
     * How close the target has to be before the foe commits to an attack - always shorter
     * than `aggroRange`, so a foe closes the gap before it attacks
     */
    range: number,
    damage: number,
    /** A chance to shove the player on a landed hit - left out, it never does */
    knockback?: FoeKnockback,
    /** A chance to stun the player on a landed hit - left out, it only flinches them */
    stun?: FoeStun,
}

/** A stun a foe's attack can give the player */
export interface FoeStun {
    /** 0-1, the odds a landed hit stuns */
    chance: number,
    /** How long the player can't move or swing - replaces `PLAYER_HURT_STUN_MS` for that hit */
    durationMs: number,
}

/** What a single landed hit does beyond damage - each rolled on its own, `null` when it missed */
export interface HitEffects {
    knockback: FoeKnockback | null,
    stunMs: number | null,
}

/** A shove a foe's attack can give the player */
export interface FoeKnockback {
    /** 0-1, the odds a landed hit shoves */
    chance: number,
    /** Horizontal push, away from the foe */
    force: number,
    /** Vertical push - negative is up, so the player leaves the ground and slides */
    lift: number,
}

/**
 * A boss calling for help - every so often while it fights, more foes appear beside it.
 * Summoned foes don't count toward a wave, so a wave clears when its own foes are down
 */
export interface FoeSummon {
    /** Key into `FOES` of what it brings in - a string, since `FoeId` is built from `FOES` itself */
    foe: string,
    /** Time spent fighting between calls - the first one comes this long after it spots you */
    intervalMs: number,
    /** How many arrive per call */
    count: number,
    /** Cap on its summons alive at once - a call with no room left brings nobody */
    maxAlive: number,
    /** How far to either side of it they appear, in world pixels */
    spread: number,
}

/**
 * What makes a foe a boss - while it lives, its health is shown in a named bar
 * along the bottom of the screen rather than left for the player to guess at
 */
export interface FoeBoss {
    /** The name printed over its bar */
    title: string,
}

/** A foe's melee attack */
export interface FoeMeleeAttack extends FoeAttackBase {
    kind: "melee",
    /** The swing's timing and reach, the same shape the player's uses - `bufferMs` goes unused, a foe's swing is started by its state, not a press */
    swing: MeleeAttackConfig,
}

/** A foe's ranged attack. */
export interface FoeRangedAttack extends FoeAttackBase, RangedAttackConfig {
    kind: "ranged",
    /** The room it needs to shoot */
    standoff: number,
}

/**
 * A foe that blows itself up - it stops, blinks for the fuse, then hurts everything
 * in the blast and dies. `range` is a straight-line distance for a flying foe
 */
export interface FoeExplodeAttack extends FoeAttackBase {
    kind: "explode",
    /** How long it hangs there blinking before it goes off - the player's window to get clear */
    fuseMs: number,
    /** Half the side of the square blast, centred on the foe, in world pixels */
    radius: number,
}

/** Foe attack type - a foe without one only hurts with body contact */
export type FoeAttack = FoeMeleeAttack | FoeRangedAttack | FoeExplodeAttack

/** A single foe type */
export interface FoeDefinition {
    name: string,
    /** Size of one frame of the foe's art - foes aren't necessarily drawn at `CHARACTER_FRAME` */
    frame: { frameWidth: number, frameHeight: number },
    anims: FoeAnims,
    /** Which way the art is drawn, so `AnimationController` knows when to mirror */
    facing: 'left' | 'right',
    scale: number,
    /** Hitbox inside the frame, tighter than the art so contact feels fair */
    body: { width: number, height: number, offsetX: number, offsetY: number },
    health: HealthConfig,
    /** Patrol pace */
    speed: number,
    chaseSpeed: number,
    /** How far it wanders either side of where it spawned */
    patrolRange: number,
    /** The beat it spends looking around at each end of a patrol */
    pauseMs: number,
    aggroRange: number,
    /** Larger than `aggroRange`, so a target at the edge can't flicker the foe in and out of the chase */
    deAggroRange: number,
    /** How far above/below the foe still counts as reachable - ignored by a flying foe, which measures straight-line distance */
    verticalReach: number,
    /** No gravity - it chases in a straight line through the air instead of along the ground */
    flying?: boolean,
    /**
     * Flying only - how far above its spawn point and the target's middle it holds, in
     * world pixels. Left out, it flies straight at the target's middle
     */
    hoverHeight?: number,
    /** Brings more foes in while it fights - left out, it never calls for help */
    summon?: FoeSummon,
    /** Marks it as a boss, with a health bar of its own on the HUD - left out, it's an ordinary foe */
    boss?: FoeBoss,
    contactDamage: number,
    /** How it fights once in range - left out, it just walks into you */
    attack?: FoeAttack,
    /** What it sounds like, from `SOUNDS` - each one optional, a foe only makes the noises it has */
    sounds?: FoeSounds,
    deathFadeMs: number,
}

/** Every foe in the game, keyed by {@link FoeId} */
export const FOES = {
    // a swordsman built on the player's own sheet - slower than the player, but
    // it hits nearly as hard
    warrior: {
        name: "Warrior",
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
        speed: 50,
        chaseSpeed: 150,
        patrolRange: 160,
        pauseMs: 1200,
        aggroRange: 300,
        deAggroRange: 420,
        verticalReach: 20,
        // nothing - the sword is what hurts, and body contact would only spend the
        // player's i-frames on a hit the swing was about to land
        contactDamage: 0,
        attack: {
            kind: "melee",
            // just inside the swing's reach, so it commits rather than nudging closer
            range: 78,
            damage: 25,
            swing: {
                windupMs: 180,
                activeMs: 260,
                // on top of the 600ms the animation itself takes, so there's a beat between swings
                cooldownMs: 450,
                bufferMs: 0, // unused - a foe's swing is started by its state, never queued
                width: 52,
                height: 70,
                offsetX: -2,
                offsetY: 6,
            },
        },
        sounds: { attack: "warrior-swing", hurt:"foe-hurt", death: "foe-death" },
        deathFadeMs: 600,
    },
    // fragile, and no threat at all once you're stood next to it - it backs off to
    // its standoff distance rather than let you close, and shoots from out there
    archer: {
        name: "Archer",
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
        speed: 35,
        chaseSpeed: 110,
        patrolRange: 120,
        pauseMs: 1500,
        // it spots you from further off than anything else, which is the whole point
        aggroRange: 440,
        deAggroRange: 540,
        verticalReach: 30,
        contactDamage: 0,
        attack: {
            kind: "ranged",
            range: 420,
            damage: 16,
            projectile: PROJECTILES.arrow,
            // the frame the arrow leaves the bow, eight frames into the eleven
            windupMs: 570,
            cooldownMs: 2000,
            standoff: 210,
            // out at the bow, roughly level with the archer's hands
            muzzleX: 22,
            muzzleY: -6,
        },
        // the bow creaks as it commits, and the string goes as the arrow leaves
        sounds: { attack: "archer-draw", shoot: "archer-loose", hurt:"foe-hurt", death: "foe-death" },
        deathFadeMs: 600,
    },

    "female-damned": {
        name: "female-damned",
        frame: ENEMY_FRAME_64,
        anims: FEMALE_DAMNED_ANIMS,
        facing: 'left', // drawn facing left, the same way the player sheet is
        scale: SCALE_FACTOR,
        // the same footprint the player has in this grid, minus the sword arm
        body: { width: 12, height: 40, offsetX: 26, offsetY: 24 },
        health: {
            max: 200,
            invulnerabilityMs: 300,
            regenPerSecond: 0,
            regenDelayMs: 0,
        },
        speed: 48,
        chaseSpeed: 110,
        patrolRange: 60,
        pauseMs: 1200,
        aggroRange: 200,
        deAggroRange: 320,
        verticalReach: 100,
        // nothing - the sword is what hurts, and body contact would only spend the
        // player's i-frames on a hit the swing was about to land
        contactDamage: 0,
        attack: {
            kind: "melee",
            // just inside the swing's reach, so it commits rather than nudging closer
            range: 50,
            damage: 12,
            swing: {
                // a beat to see it coming - it hits too often to be near-instant as well
                windupMs: 120,
                activeMs: 260,
                // on top of the 600ms the animation itself takes, so there's a beat between swings
                cooldownMs: 100,
                bufferMs: 0, // unused - a foe's swing is started by its state, never queued
                width: 28,
                height: 70,
                offsetX: -2,
                offsetY: 6,
            },
        },
        // TODO: FIND SOUNDS
        sounds: { attack: "warrior-swing", hurt:"foe-hurt", death: "foe-death" },
        deathFadeMs: 700,
    },

    "male-damned": {
        name: "male-damned",
        frame: ENEMY_FRAME_64,
        anims: MALE_DAMNED_ANIMS,
        facing: 'left', // drawn facing left, the same way the player sheet is
        scale: SCALE_FACTOR,
        // the same footprint the player has in this grid, minus the sword arm
        body: { width: 12, height: 40, offsetX: 26, offsetY: 24 },
        health: {
            max: 300,
            invulnerabilityMs: 300,
            regenPerSecond: 0,
            regenDelayMs: 0,
        },
        speed: 48,
        chaseSpeed: 140,
        patrolRange: 60,
        pauseMs: 1200,
        aggroRange: 200,
        deAggroRange: 320,
        verticalReach: 100,
        // nothing - the sword is what hurts, and body contact would only spend the
        // player's i-frames on a hit the swing was about to land
        contactDamage: 0,
        attack: {
            kind: "melee",
            // just inside the swing's reach, so it commits rather than nudging closer
            range: 52,
            damage: 10,
            knockback: { chance: 1, force: 340, lift: -120 },
            // shorter than the player's i-frames, so a stun can't be chained into another hit
            stun: { chance: 0.4, durationMs: 550 },
            swing: {
                // telegraphed - it's the hit that sends you flying
                windupMs: 150,
                activeMs: 260,
                // on top of the 600ms the animation itself takes, so there's a beat between swings
                cooldownMs: 250,
                bufferMs: 0, // unused - a foe's swing is started by its state, never queued
                width: 28,
                height: 70,
                offsetX: -2,
                offsetY: 6,
            },
        },
        // TODO: FIND SOUNDS
        sounds: { attack: "player-swing", hurt:"foe-hurt", death: "foe-death" },
        deathFadeMs: 700,
    },

    "burning-skull": {
        name: "burning-skull",
        frame: ENEMY_FRAME_64,
        anims: BURNING_SKULL_ANIMS,
        facing: 'left',
        scale: SCALE_FACTOR,
        // just the skull - the flames above it aren't something to be hit by
        body: { width: 20, height: 22, offsetX: 22, offsetY: 22 },
        health: {
            // fragile - one or two cuts pops it before it gets close
            max: 20,
            invulnerabilityMs: 200,
            regenPerSecond: 0,
            regenDelayMs: 0,
        },
        speed: 40,
        chaseSpeed: 280,
        patrolRange: 60,
        pauseMs: 1200,
        aggroRange: 500,
        deAggroRange: 540,
        verticalReach: 0, // unused - a flier measures straight-line distance
        flying: true,
        // nothing - the blast is what hurts
        contactDamage: 0,
        attack: {
            kind: "explode",
            // straight-line distance it lights the fuse at - a little inside the blast,
            // so standing still for the whole fuse is always a hit
            range: 40,
            damage: 20,
            fuseMs: 560,
            radius: 64,
            knockback: { chance: 1, force: 320, lift: -200 },
        },
        // TODO: FIND SOUNDS - an explosion for death
        sounds: { hurt: "foe-hurt", death: "foe-death" },
        // the explosion is the death animation - nothing left to fade by the end of it
        deathFadeMs: 80,
    },


    "infernal-skull": {
        name: "infernal-skull",
        frame: ENEMY_FRAME_128,
        anims: INFERNAM_SKULL_ANIMS,
        facing: 'left',
        scale: SCALE_FACTOR,
        // just the skull - the flames above it aren't something to be hit by
        body: { width: 48, height: 84, offsetX: 40, offsetY: 16 },
        health: {
            // fragile - one or two cuts pops it before it gets close
            // a dozen-odd sword cuts - a fight, not a slog
            max: 1800,
            invulnerabilityMs: 400,
            regenPerSecond: 0,
            regenDelayMs: 0,
        },
        speed: 0,
        // under the player's sprint, so it can be outpaced to set up a cut
        chaseSpeed: 200,
        patrolRange: 160,
        pauseMs: 100,
        aggroRange: 500,
        deAggroRange: 600,
        verticalReach: 0, // unused - a flier measures straight-line distance
        flying: true,
        // a big sprite - held up over the player's head, so the flames it bursts
        // out along its bottom edge come down on them
        hoverHeight: 48,
        // a skull or two out of the flames every few seconds, never more than a handful
        summon: { foe: "burning-skull", intervalMs: 11000, count: 2, maxAlive: 3, spread: 300 },
        boss: { title: "Infernal Skull" },
        // nothing - the blast is what hurts
        contactDamage: 0,
        attack: {
            kind: "melee",
            // straight-line distance it lights the fuse at - a little inside the blast,
            // so standing still for the whole fuse is always a hit
            range: 110,
            damage: 30,
            knockback: { chance: 0.5, force: 150, lift: -120 },
            swing: {
                // the flames are up from the 6th attack frame to the 10th, at 12fps
                windupMs: 417,
                activeMs: 417,
                // on top of the ~1.7s the animation itself takes - the opening to hit back in
                cooldownMs: 600,
                bufferMs: 0, // unused - a foe's swing is started by its state, never queued
                // the flame band along the bottom of the frame, the full width of the sprite
                centered: true,
                width: 232,
                height: 68,
                offsetX: 0, // ignored - centered
                // from the body's middle (frame y 56) down to the band's middle (frame y 109), x2 scale
                offsetY: 110,
            },
        },
        // TODO: FIND SOUNDS - an explosion for death
        sounds: { attack: "fire-whoosh", hurt: "foe-hurt", death: "foe-death" },
        // the explosion is the death animation - nothing left to fade by the end of it
        deathFadeMs: 80,
    },
} as const satisfies Record<string, FoeDefinition>

/** Keys of {@link FOES} */
export type FoeId = keyof typeof FOES
