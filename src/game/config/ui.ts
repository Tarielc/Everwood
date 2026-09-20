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
    /** Colour the fill flashes when health drops */
    damageFlash: number,
    damageFlashMs: number,
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
    damageFlash: 0xffffff,
    damageFlashMs: 90,
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
