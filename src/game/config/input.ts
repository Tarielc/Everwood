import { Action } from '../systems/inputs/InputSource';

/** Double tap in this timeframe triggers sprint */
export const DOUBLE_TAP_SPRINT_MS:number = 250

/** Configuration for button placement - used in `TouchSource` */
export interface TouchControlsConfig {
    radius: number,
    hitRadiusScale: number,
    margin: number,
    gap: number,
    /** How many fingers can be tracked at once, e.g. hold move, jump and attack together */
    maxTouches: number,
    pressedAlpha: number,
    depth: number,
}

/** Default touch control configuration for `TouchSource` */
export const TOUCH_CONTROLS:TouchControlsConfig = {
    radius: 48,
    hitRadiusScale: 1,
    margin: 20,
    gap: 20,
    maxTouches: 3,
    pressedAlpha: 0.55,
    depth: 2000,
}

/** A single on-screen touch button used in `TouchSource` to track different buttons */
export interface ButtonDefinition {
    /** The `RawInput` flag set while the button is held */
    action: Action,
    texture: string,
    downTexture: string,
}

/** Every on-screen touch button, keyed by {@link ButtonId}. */
export const BUTTONS = {
    "move-left": {action: "left", texture: "left-btn", downTexture: "left-btn-down"},
    "move-right": {action: "right", texture: "right-btn", downTexture: "right-btn-down"},
    "jump": {action: "jump", texture: "jump-btn", downTexture: "jump-btn-down"},
    "attack": {action: "attack", texture: "attack-btn", downTexture: "attack-btn-down"},
} as const satisfies Record<string, ButtonDefinition>

/** Keys of {@link BUTTONS} */
export type ButtonId = keyof typeof BUTTONS
