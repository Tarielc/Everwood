import { Action } from '../systems/inputs/InputSource';

// two presses of the same direction this close together sprint, for as long as
// the second press is held - the only way to sprint on touch, which has no shift
export const DOUBLE_TAP_SPRINT_MS:number = 250

// make svg
export const BUTTON_SVG_SCALE = 2

export interface TouchControlsConfig {
    radius: number,
    hitRadiusScale: number, // forgiving hit area, larger than the drawn circle
    margin: number,
    gap: number,
    maxTouches: number,
    pressedAlpha: number,
    depth: number, // above everything in the world, the controls are never occluded
}

// Default touch control configuration
export const TOUCH_CONTROLS:TouchControlsConfig = {
    radius: 48,
    hitRadiusScale: 1.25,
    margin: 20,
    gap: 20,
    maxTouches: 3,
    pressedAlpha: 0.55,
    depth: 2000,
}

export interface ButtonDefinition {
    action: Action,
    texture: string,
    downTexture: string,
}
// all the ouch buttons
export const BUTTONS = {
    "move-left": {action: "left", texture: "left-btn", downTexture: "left-btn-down"},
    "move-right": {action: "right", texture: "right-btn", downTexture: "right-btn-down"},
    "jump": {action: "jump", texture: "jump-btn", downTexture: "jump-btn-down"},
    "attack": {action: "attack", texture: "attack-btn", downTexture: "attack-btn-down"},
} as const satisfies Record<string, ButtonDefinition>

export type ButtonId = keyof typeof BUTTONS