import type { HealthConfig } from "../components/HealthComponent"
import { MeleeAttackConfig } from "../components/attack/MeleeAttack"
import type { RangedAttackConfig } from "../components/attack/RangedAttack"
import { CHARACTER_FRAME, SCALE_FACTOR } from "../config/display"
import type { FoeSounds } from "./audio"
import { ARCHER_ANIMS, FoeAnims, FOX_ANIMS, WARRIOR_ANIMS } from "./animations"
import { PROJECTILES } from "./projectiles"

/** What every foe attack has, whatever shape it takes */
interface FoeAttackBase {
    /**
     * How close the target has to be before the foe commits to an attack - always shorter
     * than `aggroRange`, so a foe closes the gap before it attacks
     */
    range: number,
    damage: number,
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

/** Foe attack type - a foe without one only hurts with body contact */
export type FoeAttack = FoeMeleeAttack | FoeRangedAttack

/** A single foe type */
export interface FoeDefinition {
    name: string,
    texture: string,
    /** The foe's own sheet grid - foes aren't necessarily cut to `CHARACTER_FRAME` */
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
    /** How far above/below the foe still counts as reachable */
    verticalReach: number,
    contactDamage: number,
    /** How it fights once in range - left out, it just walks into you */
    attack?: FoeAttack,
    /** What it sounds like, from `SOUNDS` - each one optional, a foe only makes the noises it has */
    sounds?: FoeSounds,
    deathFadeMs: number,
}

/**
 * Warrior swing, tuned against `WARRIOR_ANIMS.attack` - the window opens on the two
 * frames the slash is drawn on, and shuts as the animation ends
 */
export const WARRIOR_SWING:MeleeAttackConfig = {
    windupMs: 180,
    activeMs: 260,
    // on top of the 600ms the animation itself takes, so there's a beat between swings
    cooldownMs: 450,
    bufferMs: 0, // unused - a foe's swing is started by its state, never queued
    width: 48,
    height: 70,
    offsetX: -2,
    offsetY: 6,
}

/** Every foe in the game, keyed by {@link FoeId} */
export const FOES = {
    /**
     * This foe is no longer in use. It's broken. Not enough
     * animations to feel natural.
     * 
     * @deprecated
     */
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
        // no `sounds` - a fox fights by running into you, and the hit the player
        // takes is what announces that
        deathFadeMs: 450,
    },
    // a swordsman built on the player's own sheet - slower than the player, but
    // it hits nearly as hard
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
            range: 76,
            damage: 25,
            swing: WARRIOR_SWING,
        },
        sounds: { attack: "warrior-swing", hurt:"foe-hurt", death: "foe-death" },
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
        speed: 35,
        chaseSpeed: 110,
        patrolRange: 120,
        pauseMs: 1500,
        // it spots you from further off than anything else, which is the whole point
        aggroRange: 440,
        deAggroRange: 540,
        verticalReach: 20,
        contactDamage: 0,
        attack: {
            kind: "ranged",
            range: 400,
            damage: 16,
            projectile: PROJECTILES.arrow,
            // the frame the arrow leaves the bow, eight frames into the eleven
            windupMs: 570,
            cooldownMs: 2500,
            standoff: 210,
            // out at the bow, roughly level with the archer's hands
            muzzleX: 22,
            muzzleY: -6,
        },
        // the bow creaks as it commits, and the string goes as the arrow leaves
        sounds: { attack: "archer-draw", shoot: "archer-loose", hurt:"foe-hurt", death: "foe-death" },
        deathFadeMs: 600,
    },

    dummy: {
        name: "Warrior",
        texture: "warrior",
        frame: CHARACTER_FRAME,
        anims: WARRIOR_ANIMS,
        facing: 'right', // drawn facing left, the same way the player sheet is
        scale: SCALE_FACTOR,
        // the same footprint the player has in this grid, minus the sword arm
        body: { width: 16, height: 44, offsetX: 32, offsetY: 20 },
        health: {
            max: 8000,
            invulnerabilityMs: 300,
            regenPerSecond: 0,
            regenDelayMs: 0,
        },
        speed: 0,
        chaseSpeed: 0,
        patrolRange: 0,
        pauseMs: Infinity,
        aggroRange: 0,
        deAggroRange: 0,
        verticalReach: 0,
        // nothing - the sword is what hurts, and body contact would only spend the
        // player's i-frames on a hit the swing was about to land
        contactDamage: 0,
        attack: {
            kind: "melee",
            // just inside the swing's reach, so it commits rather than nudging closer
            range: 72,
            damage: 25,
            swing: WARRIOR_SWING,
        },
        sounds: { attack: "warrior-swing", hurt: "foe-hurt", death: "foe-death" },
        deathFadeMs: 600,
    },
} as const satisfies Record<string, FoeDefinition>

/** Keys of {@link FOES} */
export type FoeId = keyof typeof FOES
