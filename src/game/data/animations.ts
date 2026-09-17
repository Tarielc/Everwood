/** A single animation cut from a spritesheet */
export interface AnimConfig {
    key: string,
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

/** Player animations, cut from the `CHARACTER_FRAME` grid */
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
    // melee swing - locked so the walk cycle can't cut it short, but below hurt
    // and death, which are allowed to interrupt one
    attack: { key: "player-action", start: 50, end: 55, frameRate: 16, repeat: 0, priority: 5, lockUntilComplete: true },
} as const satisfies Record<string, AnimConfig>

/**
 * Animations every foe has. Only `idle` and `run` are required, so a sheet with just a
 * walk cycle still works and the states fall back to a frame it has
 */
export type FoeAnims = {
    idle: AnimConfig,
    run: AnimConfig,
    attack?: AnimConfig,
    hurt?: AnimConfig,
    death?: AnimConfig,
}

/** Fox animations, cut from a 32x32 grid */
export const FOX_ANIMS = {
    // frame 5 is blank on the sheet, so idle stops at 4
    idle: { key: "fox-idle", start: 0, end: 4, frameRate: 6, repeat: -1 },
    run: { key: "fox-run", start: 6, end: 11, frameRate: 12, repeat: -1 },
} as const satisfies FoeAnims

/**
 * Warrior animations. `warrior.png` is cut to the same `CHARACTER_FRAME` grid as the
 * player, one animation per row: idle, run, swing, flinch, and a ten-frame fall over
 */
export const WARRIOR_ANIMS = {
    idle: { key: "warrior-idle", start: 0, end: 4, frameRate: 6, repeat: -1 },
    run: { key: "warrior-run", start: 10, end: 17, frameRate: 12, repeat: -1 },
    // 600ms of swing, the blade only out in front for the last two frames
    attack: { key: "warrior-attack", start: 20, end: 25, frameRate: 10, repeat: 0, priority: 5, lockUntilComplete: true },
    // outranks the swing, so a hit lands as a flinch instead of being swallowed by it
    hurt: { key: "warrior-hurt", start: 30, end: 31, frameRate: 5, repeat: 0, priority: 10, lockUntilComplete: true },
    death: { key: "warrior-death", start: 40, end: 49, frameRate: 10, repeat: 0, priority: 20, lockUntilComplete: true },
} as const satisfies FoeAnims

/**
 * Archer animations. `archer.png` is an 11-wide, 64x64 grid - the shot alone runs
 * eleven frames, which is what the extra columns are for
 */
export const ARCHER_ANIMS = {
    idle: { key: "archer-idle", start: 0, end: 4, frameRate: 6, repeat: -1 },
    run: { key: "archer-run", start: 22, end: 29, frameRate: 12, repeat: -1 },
    // the draw, the loose and the recovery, ~790ms end to end
    attack: { key: "archer-shoot", start: 11, end: 21, frameRate: 14, repeat: 0, priority: 5, lockUntilComplete: true },
    hurt: { key: "archer-hurt", start: 33, end: 37, frameRate: 12, repeat: 0, priority: 10, lockUntilComplete: true },
    death: { key: "archer-death", start: 44, end: 49, frameRate: 10, repeat: 0, priority: 20, lockUntilComplete: true },
} as const satisfies FoeAnims
