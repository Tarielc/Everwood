/** Scale every world sprite (characters, map, projectiles) is drawn at */
export const SCALE_FACTOR:number = 2

/** Scale the HUD is drawn at, independent of the world */
export const UI_SCALE_FACTOR:number = 3

/** Touch button SVGs are rasterised this many times larger, then drawn back down so they stay sharp */
export const BUTTON_SVG_SCALE:number = 1.5

/**
 * The fewest game pixels of height the screen ever shows. A shorter screen (a phone
 * held sideways) is drawn scaled down instead of cropping the level
 */
export const MIN_VIEW_HEIGHT:number = 720
/**
 * The maximum game pixels of height the screen ever shows. A taller screen
 * is drawn scaled up instead of expanding the level and displaying background color
 */
export const MAX_VIEW_HEIGHT:number = 1280

/**
 * The grid every character sheet - the player and each equippable overlay - is cut to.
 * Equipment works by copying the player's frame index onto the item sprite, so the
 * sheets must stay frame-for-frame aligned
 */
export const CHARACTER_FRAME = { frameWidth: 80, frameHeight: 64 } as const


