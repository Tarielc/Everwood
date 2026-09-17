
/**
 * Which action buttons are pressed, reported by input source
 *
 * `InputController` resets values to `false` every frame
 * on the next frame it's initialized by input source again
 */
export interface RawInput {
    /** Move left is down */
    left: boolean
    /** Move right is down */
    right: boolean
    /** Sprint is down - a double tap sprinting is handled by `InputController`, not here */
    sprint: boolean
    /** Jump is down - JustPressed and JustReleased is handled by `InputController` */
    jump: boolean
    /** Attack is down - JustPressed is handled by `InputController` */
    attack: boolean
}

/**
 * Name of a single action, e.g. `'jump'`.
 * Used to map touch buttons to the {@link RawInput} flag they set.
 */
export type Action = keyof RawInput

/**
 * A abstract class that is implemented by different type of inpur source class
 * and then input is read by `InputController`.
 */
export interface InputSource {
    /**
     * Writes this source's current state into the shared frame. Called once per frame.
     *
     * Only set flags to `true`, never to `false` - other sources write into the same
     * object, and setting `false` would cancel their input.
     *
     * @param out - This frame's raw input, shared by all sources
     */
    sample(out: RawInput): void

    /**
     * Frees everything the source created: keys, buttons, event listeners.
     * Called by `InputController` when the scene shuts down.
     */
    destroy(): void
}
