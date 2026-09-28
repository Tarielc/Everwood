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

/**
 * Bitmap fonts loaded in `BootScene`, keyed by the name they're loaded under.
 * Each is read from `assets/fonts/<key>.png` and `assets/fonts/<key>.xml`.
 *
 * A Tiled text object whose font family matches one of these keys is drawn
 * with it - see `WorldMap.buildTexts`
 */
export const BITMAP_FONTS: readonly string[] = [
    "Jacquard24",
    "Jersey25",
    "Roboto",
]

/** The standing "Wave 3" readout an arena keeps up for as long as the run lasts - used in `WaveCounter` */
export interface WaveCounterConfig {
    /** Bitmap font key, loaded in `BootScene` */
    font: string,
    size: number,
    tint: number,
    /** Drop shadow colour, so the text reads over a bright backdrop */
    shadow: number,
    /** Gap from the top of the screen, before the safe area inset */
    margin: number,
    depth: number,
}

/** Default wave counter configuration */
export const WAVE_COUNTER: WaveCounterConfig = {
    font: "Jersey25",
    size: 32,
    tint: 0xFBFEF9,
    shadow: 0xA63446,
    // top centre - clear of the health bar on the left and the fullscreen button on the right
    margin: 20,
    depth: 1000,
}

/** A boss's named health bar along the bottom of the screen - used in `BossBar` */
export interface BossBarConfig {
    /** Bitmap font key for the boss's name, loaded in `BootScene` */
    font: string,
    titleSize: number,
    titleTint: number,
    /** Drop shadow colour, so the name reads over a bright backdrop */
    titleShadow: number,
    /** Space between the name and the top of the bar */
    titleGap: number,
    /** Widest the bar gets - on a narrow view it shrinks to fit between the margins */
    width: number,
    height: number,
    /** Dark rim drawn around the bar */
    border: number,
    /** Gap from the bottom and sides of the screen, before the safe area inset */
    margin: number,
    depth: number,
    /** Colours of the rim, the empty track, the health itself and the trailing chip */
    frameColour: number,
    trackColour: number,
    fillColour: number,
    chipColour: number,
    /** Colour the fill flashes when a hit lands */
    damageFlash: number,
    damageFlashMs: number,
    /** How long the fill takes to slide to its new value */
    tweenMs: number,
    /** How long the chip holds after a hit before it drains - each new hit restarts the wait, so a combo reads as one chunk */
    chipDelayMs: number,
    /** How long the chip takes to drain down to the fill */
    chipMs: number,
    fadeInMs: number,
    /** How long the bar stays up, empty, after the boss dies */
    fadeOutDelayMs: number,
    fadeOutMs: number,
}

/** Default boss bar configuration */
export const BOSS_BAR: BossBarConfig = {
    font: "Jersey25",
    titleSize: 32,
    titleTint: 0xFBFEF9,
    titleShadow: 0xA63446,
    titleGap: 6,
    width: 640,
    height: 14,
    border: 3,
    // bottom centre - clear of the health bar, the wave counter and the touch buttons in the corners
    margin: 40,
    depth: 1000,
    frameColour: 0x0B0B0F,
    trackColour: 0x2A2A33,
    fillColour: 0xA63446,
    chipColour: 0xF2C57C,
    damageFlash: 0xFFFFFF,
    damageFlashMs: 90,
    tweenMs: 220,
    chipDelayMs: 600,
    chipMs: 500,
    fadeInMs: 400,
    fadeOutDelayMs: 1200,
    fadeOutMs: 600,
}

/** The victory and death screens a run ends on - used in `EndScreen` */
export interface EndScreenConfig {
    /** Bitmap font keys, loaded in `BootScene` */
    titleFont: string,
    titleSize: number,
    subtitleFont: string,
    subtitleSize: number,
    optionFont: string,
    optionSize: number,
    /** Headline colour on a win, and on a death */
    victoryTint: number,
    defeatTint: number,
    /** Drop shadow colour, so the text reads over whatever is left of the level */
    shadow: number,
    subtitleTint: number,
    optionTint: number,
    /** Colour of the option under the pointer or picked with the keyboard */
    optionHoverTint: number,
    /** The wash drawn over the paused level */
    backdropColour: number,
    backdropAlpha: number,
    /** How long the wash and the text take to come up */
    fadeInMs: number,
    /** Space between the subtitle and the first option, and between the options */
    gap: number,
    /** Space kept clear on each side, in game pixels */
    margin: number,
}

/** Default end screen configuration */
export const END_SCREEN: EndScreenConfig = {
    titleFont: "Jacquard24",
    titleSize: 96,
    subtitleFont: "Jersey25",
    subtitleSize: 32,
    optionFont: "Jersey25",
    optionSize: 40,
    victoryTint: 0xF2C57C,
    defeatTint: 0xA63446,
    shadow: 0x0B0B0F,
    subtitleTint: 0xFBFEF9,
    optionTint: 0xFBFEF9,
    optionHoverTint: 0xF2C57C,
    backdropColour: 0x0B0B0F,
    backdropAlpha: 0.7,
    fadeInMs: 600,
    gap: 28,
    margin: 24,
}

/** The row of running power ups under the health bar - used in `PowerUpTray` */
export interface PowerUpTrayConfig {
    /** Left edge of the first icon, before the safe area inset */
    x: number,
    /** Space between the bottom of the health bar's frame and the icons - follows the HUD's scale */
    offsetY: number,
    /** Scale the 16px icons are drawn at on a reference-sized view - see `hudScale` */
    iconScale: number,
    /** Space between two icons - this and the bar sizes follow the icons' scale */
    gap: number,
    /** The draining timer bar under each icon */
    barHeight: number,
    barGap: number,
    /** Colour of the empty part of the timer bar */
    barBackground: number,
    /** The last stretch of an effect its icon spends blinking */
    warnMs: number,
    /** ms of each blink while it warns */
    blinkMs: number,
    depth: number,
}

/** Default power up tray configuration */
export const POWER_UP_TRAY: PowerUpTrayConfig = {
    x: 20,
    offsetY: 16,
    iconScale: 3,
    gap: 12,
    barHeight: 5,
    barGap: 4,
    barBackground: 0x1A1A1A,
    warnMs: 2000,
    blinkMs: 150,
    depth: 1000,
}

/** The name that floats up off a power up as it's picked up - used in `GameScene` */
export const POWER_UP_CALLOUT = {
    font: "Jersey25",
    size: 22,
    shadow: 0x000000,
    /** How far it rises before it's gone */
    rise: 36,
    durationMs: 900,
    depth: 900,
} as const

/** A controls hint placed in Tiled, drawn over its area while the player stands in it - used in `MapHints` */
export interface MapHintConfig {
    /** Bitmap font key, loaded in `BootScene` */
    font: string,
    size: number,
    tint: number,
    /** Drop shadow colour, so the text reads over a bright backdrop */
    shadow: number,
    /** Widest the text ever wraps at, in world pixels */
    maxWidth: number,
    /** Fraction of the screen's width the text wraps at when that is narrower than `maxWidth` */
    maxWidthFraction: number,
    /** Gap between the top of the hint's area and the bottom of its text, in world pixels */
    gap: number,
    /** How long it takes to fade in or out */
    fadeMs: number,
    /** Over the level and the foes, under the screen-edge vignettes and the HUD */
    depth: number,
}

/** Default map hint configuration */
export const MAP_HINT: MapHintConfig = {
    font: "Jersey25",
    size: 26,
    tint: 0xFBFEF9,
    shadow: 0x000000,
    maxWidth: 420,
    maxWidthFraction: 0.8,
    gap: 12,
    fadeMs: 250,
    depth: 800,
}

/** A speech bubble placed in Tiled, typed out while the player is close - used in `MapDialogue` */
export interface MapDialogueConfig {
    /** Bitmap font key, loaded in `BootScene` */
    font: string,
    size: number,
    tint: number,
    /** Widest the text ever wraps at, in world pixels */
    maxWidth: number,
    /**
     * Fraction of the screen's width the whole bubble, padding included, is kept to when
     * that is narrower than `maxWidth` allows
     */
    maxWidthFraction: number,
    /** Space between the text and the bubble's edge */
    padding: number,
    background: number,
    backgroundAlpha: number,
    border: number,
    borderWidth: number,
    cornerRadius: number,
    /** Height of the tail pointing down at the speaker - its base is twice as wide */
    tail: number,
    /** How fast the line is typed out */
    charsPerSecond: number,
    /** How long the bubble takes to fade in or out */
    fadeMs: number,
    /** Default reach of a point dialogue, in map pixels - a `radius` property on the object overrides it */
    radius: number,
    /** Over the level, the foes and the hints */
    depth: number,
}

/** Default map dialogue configuration */
export const MAP_DIALOGUE: MapDialogueConfig = {
    font: "Jersey25",
    size: 24,
    tint: 0xFBFEF9,
    maxWidth: 360,
    maxWidthFraction: 0.7,
    padding: 12,
    background: 0x1A1A1A,
    backgroundAlpha: 0.85,
    border: 0xFBFEF9,
    borderWidth: 2,
    cornerRadius: 8,
    tail: 10,
    charsPerSecond: 40,
    fadeMs: 200,
    radius: 96,
    depth: 810,
}
