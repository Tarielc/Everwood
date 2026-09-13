import * as Phaser from 'phaser';
import { InputSource, RawInput } from './InputSource';
import KeyboardSource from './KeyboardSource';
import TouchSource from './TouchSource';
import { DOUBLE_TAP_SPRINT_MS } from '../../utils/constants';

type Direction = 'left' | 'right'

// drives MovementController - can be implemented by KeyBoard, Touchpad, etc.
export interface InputState {
    readonly moveLeft: boolean
    readonly moveRight: boolean
    readonly sprintHeld: boolean
    readonly jumpHeld: boolean
    readonly jumpJustPressed: boolean
    readonly jumpJustReleased: boolean
    readonly attackHeld: boolean
    readonly attackJustPressed: boolean
}

export interface InputControllerOptions {
    keyboard?: boolean
    touch?: 'auto' | 'always' | 'never'
}

// turn every input source into a single inputState Controller
export default class InputController implements InputState {
    moveLeft: boolean = false
    moveRight: boolean = false
    sprintHeld: boolean = false
    jumpHeld: boolean = false
    jumpJustPressed: boolean = false
    jumpJustReleased: boolean = false
    attackHeld: boolean = false
    attackJustPressed: boolean = false

    // all the input sources and their raw input
    private sources: InputSource[] = []
    private frame: RawInput = {
        left: false,
        right: false,
        sprint: false,
        jump: false,
        attack: false
    }

    // when each direction was last pressed, and the one a double tap is sprinting in
    private lastPressAt: Record<Direction, number> = { left: -Infinity, right: -Infinity }
    private tapSprint: Direction | null = null

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

        const now = this.scene.time.now
        if (this.moveLeft && !wasLeft) this.onDirectionPressed('left', now)
        if (this.moveRight && !wasRight) this.onDirectionPressed('right', now)

        // the sprint lasts only as long as the second press is held
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

    destroy(): void {
        for (const source of this.sources) {
            source.destroy()
        }
        this.sources.length = 0
    }
}
