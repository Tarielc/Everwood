import { MovementConfig } from "../components/MovementController"

export const SCALE_FACTOR:number = 2
export const UI_SCALE_FACTOR:number = 7
export const PLAYER_MOVEMENT:MovementConfig = {
    speed: 200,
    acceleration: 900,
    drag: 700,
    jumpVelocity: -320,
    jumpCutMultiplier: 0.5,
    gravity: 100,
    fallGravityMultiplier: 1.5,
    coyoteTimeMs: 100,
    jumpBufferMs: 120,
    maxFallSpeed: 600,
}
export interface TouchControlsConfig {
    radius: number,
    hitRadiusScale: number, // forgiving hit area, larger than the drawn circle
    margin: number,
    gap: number,
    maxTouches: number,
    pressedAlpha: number,
}

export const TOUCH_CONTROLS:TouchControlsConfig = {
    radius: 56,
    hitRadiusScale: 1.25,
    margin: 20,
    gap: 10,
    maxTouches: 3,
    pressedAlpha: 0.55,
}
