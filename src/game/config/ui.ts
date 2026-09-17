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
    margin: 10,
    gap: 10,
    depth: 2000,
}
