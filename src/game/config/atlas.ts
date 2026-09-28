/**
 * Key the sprite atlas loads under. Every character, foe, weapon, projectile,
 * pickup and HUD image is a frame in `assets/atlas/sprites.png`, named in `sprites.json`
 */
export const ATLAS = "sprites"

/** Where the atlas is served from, relative to `public/` */
export const ATLAS_PATH = {
    image: "assets/atlas/sprites.png",
    data: "assets/atlas/sprites.json",
} as const

/** Frame names of the single-image UI art packed into the atlas */
export const UI_FRAMES = {
    "startBtn": "UI/start-btn.png",
    "progBar-frame": "UI/progBar-frame.png",
    "progBar-line": "UI/progBar-line.png",
    "hpBar": "UI/healthbar/HP-bar.png",
    "manaBar": "UI/healthbar/blue-bar.png",
    "healthBar": "UI/healthbar/red-bar.png",
    "staminaBar": "UI/healthbar/yellow-bar.png",
    "fullscreen-enter": "UI/fullscreen-enter-btn.png",
    "fullscreen-exit": "UI/fullscreen-exit-btn.png",
    "music-on": "UI/music-on-btn.png",
    "music-off": "UI/music-off-btn.png",
    "volume-on": "UI/volume-on-btn.png",
    "volume-off": "UI/volume-off-btn.png",
    "sprint-btn": "UI/sprint-btn.png",
} as const

/** Keys of {@link UI_FRAMES} */
export type UiFrame = keyof typeof UI_FRAMES

/**
 * Name of one frame of an animation sequence in the atlas
 *
 * @param prefix - everything before the frame number, e.g. `player/player-idle-`
 * @param index - the frame's number within its sequence
 */
export const atlasFrame = (prefix: string, index: number): string => `${prefix}${index}.png`
