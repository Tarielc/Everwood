/** A single animation, played off a numbered frame sequence in the sprite atlas */
export interface AnimConfig {
    key: string,
    /** Atlas frame name up to the frame number, e.g. `player/player-idle-` */
    prefix: string,
    /** First and last frame number of the sequence, inclusive */
    start: number,
    end: number,
    frameRate: number,
    repeat: number,
    yoyo?: boolean,
    /** Higher priority interrupts a locked animation. Default used by `AnimationController` when `play()` doesn't override it */
    priority?: number,
    /** Don't let other animations cut this one short. Default used by `AnimationController` when `play()` doesn't override it */
    lockUntilComplete?: boolean,
}

/** Start of every player frame name in the atlas, before the pose and frame number */
export const PLAYER_FRAME_PREFIX = "player/player-"

/** Player animations, 80x64 frames under `player/` in the atlas */
export const PLAYER_ANIMS = {
    idle: { key: "player-idle", prefix: "player/player-idle-", start: 0, end: 4, frameRate: 8, repeat: -1 },
    walk: { key: "player-walk", prefix: "player/player-walk-", start: 0, end: 7, frameRate: 14, repeat: -1 },
    sprint: { key: "player-sprint", prefix: "player/player-sprint-", start: 0, end: 7, frameRate: 14, repeat: -1 },
    jump: { key: "player-jump", prefix: "player/player-jump-", start: 0, end: 3, frameRate: 12, repeat: -1 },
    fall: { key: "player-fall", prefix: "player/player-fall-", start: 0, end: 3, frameRate: 8, repeat: -1 },
    // hurt and death outrank the movement animations, and hold their frames to the
    // end so a flinch can't be cut short by the walk cycle resuming underneath it
    hurt: { key: "player-hurt", prefix: "player/player-death-", start: 0, end: 1, frameRate: 8, repeat: 0, priority: 10, lockUntilComplete: true },
    death: { key: "player-death", prefix: "player/player-death-", start: 0, end: 9, frameRate: 8, repeat: 0, priority: 20, lockUntilComplete: true },
    // melee swing - locked so the walk cycle can't cut it short, but below hurt
    // and death, which are allowed to interrupt one
    attack: { key: "player-action", prefix: "player/player-swing-", start: 0, end: 5, frameRate: 16, repeat: 0, priority: 5, lockUntilComplete: true },
} as const satisfies Record<string, AnimConfig>

/**
 * Animations every foe has. Only `idle` and `run` are required, so a foe with just a
 * walk cycle still works and the states fall back to a frame it has
 */
export type FoeAnims = {
    idle: AnimConfig,
    run: AnimConfig,
    attack?: AnimConfig,
    hurt?: AnimConfig,
    death?: AnimConfig,
}

/**
 * Warrior animations, 80x64 frames like the player's: idle, run, swing, flinch,
 * and a ten-frame fall over
 */
export const WARRIOR_ANIMS = {
    idle: { key: "warrior-idle", prefix: "foes/warrior/warrior-idle-", start: 0, end: 4, frameRate: 6, repeat: -1 },
    run: { key: "warrior-run", prefix: "foes/warrior/warrior-run-", start: 0, end: 7, frameRate: 12, repeat: -1 },
    // 600ms of swing, the blade only out in front for the last two frames
    attack: { key: "warrior-attack", prefix: "foes/warrior/warrior-attack-", start: 0, end: 5, frameRate: 10, repeat: 0, priority: 5, lockUntilComplete: true },
    // outranks the swing, so a hit lands as a flinch instead of being swallowed by it
    hurt: { key: "warrior-hurt", prefix: "foes/warrior/warrior-hurt-", start: 0, end: 1, frameRate: 5, repeat: 0, priority: 10, lockUntilComplete: true },
    death: { key: "warrior-death", prefix: "foes/warrior/warrior-death-", start: 0, end: 9, frameRate: 10, repeat: 0, priority: 20, lockUntilComplete: true },
} as const satisfies FoeAnims

/**
 * Archer animations, 64x64 frames - the shot alone runs eleven frames
 */
export const ARCHER_ANIMS = {
    idle: { key: "archer-idle", prefix: "foes/archer/archer-idle-", start: 0, end: 4, frameRate: 6, repeat: -1 },
    run: { key: "archer-run", prefix: "foes/archer/archer-run-", start: 0, end: 7, frameRate: 12, repeat: -1 },
    // the draw, the loose and the recovery, ~790ms end to end
    attack: { key: "archer-shoot", prefix: "foes/archer/archer-attack-", start: 0, end: 10, frameRate: 14, repeat: 0, priority: 5, lockUntilComplete: true },
    hurt: { key: "archer-hurt", prefix: "foes/archer/archer-hurt-", start: 0, end: 4, frameRate: 12, repeat: 0, priority: 10, lockUntilComplete: true },
    death: { key: "archer-death", prefix: "foes/archer/archer-death-", start: 0, end: 5, frameRate: 10, repeat: 0, priority: 20, lockUntilComplete: true },
} as const satisfies FoeAnims

export const FEMALE_DAMNED_ANIMS = {
    idle: {key: "female-damned-idle", prefix: "foes/female-damned/female-damned-idle-", start: 0, end: 4, frameRate: 6, repeat: -1},
    run:  {key: "female-damned-run", prefix: "foes/female-damned/female-damned-run-", start: 0, end: 7, frameRate: 10, repeat: -1 },
    attack: {key: "femele-damned-attack", prefix: "foes/female-damned/female-damned-attack-", start: 0, end: 5, frameRate: 14, repeat: 0, priority: 5, lockUntilComplete: true},
    death: {key: "femele-damned-death", prefix: "foes/female-damned/female-damned-death-", start: 0, end: 5, frameRate: 10, repeat: 0, priority: 20, lockUntilComplete: true},
} as const satisfies FoeAnims

export const MALE_DAMNED_ANIMS = {
    idle: {key: "male-damned-idle", prefix: "foes/male-damned/male-damned-idle-", start: 0, end: 4, frameRate: 6, repeat: -1},
    run:  {key: "male-damned-run", prefix: "foes/male-damned/male-damned-run-", start: 0, end: 7, frameRate: 10, repeat: -1 },
    attack: {key: "male-damned-attack", prefix: "foes/male-damned/male-damned-attack-", start: 0, end: 5, frameRate: 14, repeat: 0, priority: 5, lockUntilComplete: true},
    death: {key: "male-damned-death", prefix: "foes/male-damned/male-damned-death-", start: 0, end: 5, frameRate: 10, repeat: 0, priority: 20, lockUntilComplete: true},
} as const satisfies FoeAnims

/**
 * Burning skull, 64x64 frames - the idle flicker is the one it has for everything,
 * the death is the explosion it dies in
 */
export const BURNING_SKULL_ANIMS = {
    idle: {key: "burning-skull-idle", prefix: "foes/burning-skull/burning-skull-idle-", start: 0, end: 4, frameRate: 8, repeat: -1},
    run: {key: "burning-skull-run", prefix: "foes/burning-skull/burning-skull-idle-", start: 0, end: 4, frameRate: 12, repeat: -1},
    // plays once, so collapse() gets its onComplete and starts the fade
    death: {key: "burning-skull-death", prefix: "foes/burning-skull/burning-skull-death-", start: 0, end: 6, frameRate: 14, repeat: 0, priority: 20, lockUntilComplete: true},
} as const satisfies FoeAnims

/**
 * Large boss skull, 128x128 frames - ten of idle, twenty of the flame burst it
 * attacks with (the flames are up on attack frames 5-9), and ten of dissolving
 */
export const INFERNAM_SKULL_ANIMS = {
    idle: {key: "infernal-skull-idle", prefix: "foes/infernal-skull/infernal-skull-idle-", start: 0, end: 9, frameRate: 8, repeat: -1},
    run: {key: "infernal-skull-run", prefix: "foes/infernal-skull/infernal-skull-idle-", start: 0, end: 9, frameRate: 12, repeat: -1},
    // each needs its own key - a reused one is skipped at registration and plays the run
    // cycle instead. played once and locked, so the Attack state waits out the burst
    // and collapse() gets its onComplete
    attack: {key: "infernal-skull-attack", prefix: "foes/infernal-skull/infernal-skull-attack-", start: 0, end: 19, frameRate: 12, repeat: 0, priority: 5, lockUntilComplete: true},
    death: {key: "infernal-skull-death", prefix: "foes/infernal-skull/infernal-skull-death-", start: 0, end: 9, frameRate: 12, repeat: 0, priority: 20, lockUntilComplete: true},
} as const satisfies FoeAnims