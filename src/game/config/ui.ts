/** Layout and feel of the player's health / stamina / mana HUD - used in `HealthBar` */
export interface HealthBarConfig {
    /** Where the HUD sits in the corner, before UI scaling */
    x: number,
    y: number,
    scale: number,
    depth: number,
    /** Each fill's offset inside the frame image, in unscaled texture pixels */
    health: { x: number, y: number },
    stamina: { x: number, y: number },
    mana: { x: number, y: number },
    /** How long a fill takes to slide to its new value */
    tweenMs: number,
    /** Slower fill used when health is restored by a heal (not regen) */
    healTweenMs: number,
    /** Colour the fill flashes when health drops */
    damageFlash: number,
    damageFlashMs: number,
    /** Colour of the outline drawn around the frame when health is restored */
    healOutline: number,
    /** Outline thickness, in unscaled texture pixels */
    healOutlineWidth: number,
    /** Full fade in and back out of the outline */
    healOutlineMs: number,
}

/** Default health bar configuration */
export const HEALTH_BAR:HealthBarConfig = {
    x: 20,
    y: 20,
    scale: 2,
    depth: 1000,
    health: { x: 4, y: 4 },
    stamina: { x: 66, y: 47 },
    mana: { x: 63, y: 54 },
    tweenMs: 220,
    healTweenMs: 1200,
    damageFlash: 0xffffff,
    damageFlashMs: 90,
    healOutline: 0xffffff,
    healOutlineWidth: 1,
    healOutlineMs: 1200,
}

/** How a screen-edge gradient looks and moves - used in `Vignette` */
export interface VignetteConfig {
    /** Colour the edges bleed towards */
    edge: number,
    /** Colour the corners end on */
    corner: number,
    /** Radius of the untouched middle, as a fraction of half the screen */
    inner: number,
    /** Opacity at full strength */
    maxAlpha: number,
    /** How long a held strength takes to ease fully in or out */
    fadeMs: number,
    /** Optional heartbeat on the held strength - a flash is never pulsed */
    pulse?: {
        /** Length of one beat */
        periodMs: number,
        /** How much of the opacity a beat takes away at its low point, 0..1 */
        depth: number,
    },
    /** Resolution of the generated gradient, it's stretched to the screen */
    textureSize: number,
    depth: number,
}

/** Timing of a one-off `Vignette.flash` */
export interface VignetteFlash {
    /** How quickly it swells in */
    inMs: number,
    /** How long it holds at the peak */
    holdMs: number,
    /** How long it takes to ebb away */
    outMs: number,
}

/** Red/black darkening at the screen edges while health is low */
export const LOW_HEALTH_VIGNETTE: VignetteConfig & {
    /** Strength the moment health crosses `LOW_HEALTH_RATIO` - it deepens to 1 near death */
    minStrength: number,
} = {
    edge: 0x8B0000,
    corner: 0x000000,
    // a wide clear middle and a soft ceiling - a warning at the edges, never a blindfold
    inner: 0.8,
    maxAlpha: 0.5,
    fadeMs: 600,
    pulse: { periodMs: 1100, depth: 0.3 },
    minStrength: 0.3,
    textureSize: 192,
    // kept below the HUD so the bars stay readable
    depth: 900,
}

/** Faint red edge that flashes when the player takes a hit */
export const DAMAGE_VIGNETTE: VignetteConfig & { flash: VignetteFlash } = {
    edge: 0xB01010,
    corner: 0x3A0000,
    inner: 0.9,
    // slight - a nudge that a hit landed, the sprite flash and screen shake do the rest
    maxAlpha: 0.3,
    fadeMs: 0, // only ever flashed
    flash: { inMs: 60, holdMs: 40, outMs: 350 },
    textureSize: 64,
    // under the low-health vignette, which already covers the edges when a hit matters most
    depth: 899,
}

/** Green glow at the screen edges when the player is healed */
export const HEAL_VIGNETTE: VignetteConfig & { flash: VignetteFlash } = {
    edge: 0x4aa859,
    // a deep green rather than black, so a heal reads as a glow and not a darkening
    corner: 0x0B5A1E,
    inner: 0.8,
    maxAlpha: 0.2,
    fadeMs: 0, // only ever flashed
    flash: { inMs: 200, holdMs: 150, outMs: 1000 },
    textureSize: 128,
    // over the low-health vignette, so a heal out of danger shows green as the red fades
    depth: 901,
}

/** UI Buttons */
/** Configuration for button placement - used in `TouchSource` */
export interface UiButtonConfig {
    radius: number,
    hitRadiusScale: number,
    margin: number,
    gap: number,
    depth: number,
}
export const UI_BUTTONS: UiButtonConfig = {
    radius: 36,
    hitRadiusScale: 1.25,
    margin: 20,
    gap: 10,
    depth: 2000,
}

/** Wave announcement - the "Wave 3" that drops in over an arena between waves */
export interface TextBannerConfig {
    /** Bitmap font key, loaded in `BootScene` */
    font: string,
    size: number,
    tint: number,
    /** Drop shadow colour, so the text reads over a bright backdrop */
    shadow: number,
    /** How far down the screen it sits, as a fraction of the view's height */
    y: number,
    depth: number,
    /** How long it takes to fade in - and, yoyoed, back out again */
    fadeMs: number,
    /** How long it holds at full opacity between the two */
    holdMs: number,
}

/** Default wave announcement configuration */
export const TEXT_WAVE_BANNER: TextBannerConfig = {
    font: "Jacquard24",
    size: 72,
    tint: 0xFBFEF9,
    shadow: 0xA63446,
    // high enough to stay clear of the player, low enough to read as a headline
    y: 0.2,
    depth: 1000,
    fadeMs: 350,
    holdMs: 1000,
}
