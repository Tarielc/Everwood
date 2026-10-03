/** Scale every world sprite (characters, map, projectiles) is drawn at */
export const SCALE_FACTOR:number = 2

/** Scale the HUD is drawn at, independent of the world */
export const UI_SCALE_FACTOR:number = 3

/**
 * Shorter side of the view, in game pixels, the HUD is authored for - at this size every
 * HUD element draws at its configured scale, and grows or shrinks with the view from there
 */
export const UI_REFERENCE_SIZE:number = 720

/** How far the HUD follows the view - a portrait phone stops at `min`, a big desktop at `max` */
export const UI_SCALE_RANGE = { min: 0.5, max: 1.5 } as const

/** Touch button SVGs are rasterised this many times larger, then drawn back down so they stay sharp */
export const BUTTON_SVG_SCALE:number = 2

/**
 * The fewest game pixels of height the screen ever shows. A shorter screen (a phone
 * held sideways) is drawn scaled down instead of cropping the level
 */
export const MIN_VIEW_HEIGHT:number = 704
/**
 * The maximum game pixels of height the screen ever shows. A taller screen
 * is drawn scaled up instead of expanding the level and displaying background color
 */
export const MAX_VIEW_HEIGHT:number = 736

/**
 * Frame size of every character - the player and each equippable overlay. Equipment
 * works by mapping the player's frame onto the weapon's, so the frames must stay
 * pose-for-pose aligned
 */
export const CHARACTER_FRAME = { frameWidth: 80, frameHeight: 64 } as const

export const ENEMY_FRAME_64 = { frameWidth: 64, frameHeight: 64 } as const
export const ENEMY_FRAME_128 = { frameWidth: 128, frameHeight: 128 } as const


