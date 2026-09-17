import * as Phaser from 'phaser';
import { InputSource, RawInput } from './InputSource';
import KeyboardSource from './KeyboardSource';
import TouchSource from './TouchSource';
import { DOUBLE_TAP_SPRINT_MS } from '../../config/input';

/** A horizontal direction (can be double tapped for sprint) */
type Direction = 'left' | 'right'

/**
 * Per frame player intent, independent of the device that produced it.
 * 
 * Consumed by `MovementController` (and the player states), so gameplay code
 * never thas to know whether input came from keyboard, touchscreen, or both.
 * 
 * `...Held` - the action is down on this frame.
 * `...JustPressed` / `...JustReleased` - the action changed on this frame.
*/
export interface InputState {
    /** Left movement is held */
    readonly moveLeft: boolean
    /** Right movement is held */
    readonly moveRight: boolean
    /** Sprint is active - either sprint key is held, or double tap triggered it  */
    readonly sprintHeld: boolean
    /** Jump is held - if jump button is released early, it cuts player jump height */
    readonly jumpHeld: boolean
    /** Jump was pressed this frame */
    readonly jumpJustPressed: boolean
    /** JUmp was released this frame */
    readonly jumpJustReleased: boolean
    /** Attack is held */
    readonly attackHeld: boolean
    /** Attack was pressed this frame (one press is one swing) */
    readonly attackJustPressed: boolean
}

/** Options that which choose input sources */
export interface InputControllerOptions {
    /**
     * try reading a keyboard.
     * @defaultValue `true`
     */
    keyboard?: boolean
    /**
     * When to read on-screen touch controls:
     * - `auto` - only on devices that report touch support
     * - `always` - on every device
     * - `never` - never
     * @defaultValue `auto`
     */
    touch?: 'auto' | 'always' | 'never'
}


/**
 * Merge and translate every active {@link InputSource} into a single {@link InputState}
 * 
 * Keyboard and touch can be used at the same time.
 * Besides raw input, it derives edge flags like `JustPessed` and `JustReleased`
 * and triggers sprinting on double touch.
 * 
 * Call {@link InputController.update} once per frame before anything reads the input.
 * 
 * Turn every input source into a single inputState controler
 * Which is read by {@link MovementController}
 * ```ts
 * // Scene.create()
 * this.controls = new InputController(this, {touch: `auto`})
 * this.player = new Player(this, x, y, "player", this.controls)
 * 
 * // Scene.update()
 * this.controls.update()
 * this.player.update(time, delta) // reads this.controls, as InputState
 * ```
 */
export default class InputController implements InputState {
    moveLeft: boolean = false
    moveRight: boolean = false
    sprintHeld: boolean = false
    jumpHeld: boolean = false
    jumpJustPressed: boolean = false
    jumpJustReleased: boolean = false
    attackHeld: boolean = false
    attackJustPressed: boolean = false

    /** Created input sources, which are traversed every frame */
    private sources: InputSource[] = []
    //** Raw input merged from all sources for the current frame. */
    private frame: RawInput = {
        left: false,
        right: false,
        sprint: false,
        jump: false,
        attack: false
    }

    /**
     * Scene time of the last press of each direction for detecting double tap.
     */
    private lastPressAt: Record<Direction, number> = { left: -Infinity, right: -Infinity }
    /** Direction the double tap sprint is running in, or `null` when not sprinting from a double tap */
    private tapSprint: Direction | null = null

    /**
     * Create input sources that are enabled an available.
     * Register cleanup on scene's `SHUTDOWN` or `DESTROY` events.
     * 
     * @param scene - Scene whose input plugins are read; clock time for double tap sprint
     * @param options - Which sourcs to create
     */
    constructor(private scene: Phaser.Scene, options: InputControllerOptions = {}) {
        const { keyboard = true, touch = 'auto' } = options

        // if keyboard is present, add it to source inputs
        if (keyboard && scene.input.keyboard) {
            this.sources.push(new KeyboardSource(scene))
        }

        // if touch device is present, add it to source inputs
        const wantsTouch = touch === 'always'
            || (touch === 'auto' && scene.sys.game.device.input.touch)

        if (wantsTouch) {
            this.sources.push(new TouchSource(scene))
        }

        // one time listener for events shutdown and destroy - destroys input sources
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this)
        scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this)
    }

    /**
     * Reads every source and refreshed the {@link InputState} fields.
     * 
     * To detect `JustPressed` and `JustReleased` we compare current `held` value to the previous one.
     * For double tap sprint we compare time difference between current and last press for that direction.
     */
    update(): void {
        const frame = this.frame
        frame.left = false
        frame.right = false
        frame.sprint = false
        frame.jump = false
        frame.attack = false

        for (const source of this.sources) {
            source.sample(frame)
        }

        const wasJumpHeld = this.jumpHeld
        const wasAttackHeld = this.attackHeld
        const wasLeft = this.moveLeft
        const wasRight = this.moveRight

        // apply boolean values that represent whether buttons are held or not
        this.moveLeft = frame.left
        this.moveRight = frame.right

        // only fresh press counts towards double tap, not holding
        const now = this.scene.time.now
        if (this.moveLeft && !wasLeft) this.onDirectionPressed('left', now)
        if (this.moveRight && !wasRight) this.onDirectionPressed('right', now)

        // the sprint lasts only as long as second press is held
        if (this.tapSprint === 'left' && !this.moveLeft) this.tapSprint = null
        if (this.tapSprint === 'right' && !this.moveRight) this.tapSprint = null

        this.sprintHeld = frame.sprint || this.tapSprint !== null
        this.jumpHeld = frame.jump
        this.attackHeld = frame.attack

        // extra values to track "just pressed" values for jump
        this.jumpJustPressed = this.jumpHeld && !wasJumpHeld
        this.jumpJustReleased = !this.jumpHeld && wasJumpHeld

        // a swing fires on the press, never on the hold - one tap, one swing
        this.attackJustPressed = this.attackHeld && !wasAttackHeld
    }

    /**
     * Handle a fresh press of a direction for the double tap sprinting.
     * 
     * - Second press on same diretion withing {@link DOUBLE_TAP_SPRINT_MS} starts sprinting
     * - Any other press records its time as the first tap of a new double-tap pair and stops current sprint
     * 
     * @param direction - which direction input just got pressed 
     * @param now - Scene time of the press
     */
    private onDirectionPressed(direction: Direction, now: number): void {
        if (now - this.lastPressAt[direction] <= DOUBLE_TAP_SPRINT_MS) {
            this.tapSprint = direction
            // a third quick tap starts a fresh pair rather than chaining off this one
            this.lastPressAt[direction] = -Infinity
        } else {
            // turning around drops a sprint, the other direction has to be double tapped too
            if (this.tapSprint !== direction) this.tapSprint = null
            this.lastPressAt[direction] = now
        }
    }

    /**
     * Destroy everu input source
     * 
     * Called automatically on scene `SHUTDOWN` or `DESTROY`.
     */
    destroy(): void {
        for (const source of this.sources) {
            source.destroy()
        }
        this.sources.length = 0
    }
}
