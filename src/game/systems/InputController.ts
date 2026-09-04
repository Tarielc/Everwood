import * as Phaser from 'phaser';
import { InputSource, RawInput } from './InputSource';
import KeyboardSource from './KeyboardSource';
import TouchSource from './TouchSource';

// drives MovementController - can be implemented by KeyBoard, Touchpad, etc.
export interface InputState {
    readonly moveLeft: boolean
    readonly moveRight: boolean
    readonly jumpHeld: boolean
    readonly jumpJustPressed: boolean
    readonly jumpJustReleased: boolean
}

export interface InputControllerOptions {
    keyboard?: boolean
    touch?: 'auto' | 'always' | 'never'
}

// turn every input source into a single inputState Controller
export default class InputController implements InputState {
    moveLeft: boolean = false
    moveRight: boolean = false
    jumpHeld: boolean = false
    jumpJustPressed: boolean = false
    jumpJustReleased: boolean = false

    // all the input sources and their raw input
    private sources: InputSource[] = []
    private frame: RawInput = {
        left: false,
        right: false,
        jump: false
    }

    constructor(scene: Phaser.Scene, options: InputControllerOptions = {}) {
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
        frame.jump = false

        for (const source of this.sources) {
            source.sample(frame)
        }

        const wasJumpHeld = this.jumpHeld

        // apply boolean values that represent whether buttons are held or not
        this.moveLeft = frame.left
        this.moveRight = frame.right
        this.jumpHeld = frame.jump

        // extra values to track "just pressed" values for jump
        this.jumpJustPressed = this.jumpHeld && !wasJumpHeld
        this.jumpJustReleased = !this.jumpHeld && wasJumpHeld
    }

    destroy(): void {
        for (const source of this.sources) {
            source.destroy()
        }
        this.sources.length = 0
    }
}
