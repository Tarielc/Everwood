/** Length of the frame every per-frame damping factor in the game was tuned against - 60 FPS */
const REFERENCE_FRAME_MS = 1000 / 60

/**
 * A per-frame damping factor, stretched over however long this frame actually was.
 *
 * `velocity *= 0.85` every frame bleeds speed off twice as fast on a 120 Hz screen as
 * on a 60 Hz one. Raising the factor to the share of a 60 FPS frame that went by keeps
 * the slowdown the same per second, whatever the refresh rate
 *
 * @param factor - What is kept each frame at 60 FPS, `0`-`1`
 * @param dt - Time since the last frame, in ms
 * @returns What to multiply by this frame
 */
export function damping(factor: number, dt: number): number {
    return Math.pow(factor, dt / REFERENCE_FRAME_MS)
}
