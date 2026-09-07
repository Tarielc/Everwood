import * as Phaser from 'phaser';
import { InputSource, RawInput } from './InputSource';
import { TOUCH_CONTROLS, TouchControlsConfig, UI_SCALE_FACTOR } from '../../utils/constants';

type Action = keyof RawInput

interface TouchButton {
    action: Action
    button: Phaser.GameObjects.Image
    pressed: boolean
}

export default class TouchSource implements InputSource {
    // for touch device we use array of on-screen buttons
    private buttons: TouchButton[] = []

    constructor(private scene: Phaser.Scene, config: TouchControlsConfig = TOUCH_CONTROLS) {
        scene.input.addPointer(config.maxTouches - 1)

        const { width, height } = scene.scale.gameSize
        const { radius, margin, gap } = config

        // create control buttons
        const leftBtn = this.scene.add.image(margin + radius, height - margin - radius, "left-btn")
            .setScale(UI_SCALE_FACTOR)
        const rightBtn = this.scene.add.image(margin + radius * 2 + gap, height - margin - radius, "right-btn")
            .setScale(UI_SCALE_FACTOR)
        const jumpBtn = this.scene.add.image(width - margin - radius, height - margin - radius, "jump-btn")
            .setScale(UI_SCALE_FACTOR)
        const sprintBtn = this.scene.add.image(width - margin - radius * 2 - gap, height - margin - radius, "sprint-btn")
            .setScale(UI_SCALE_FACTOR)
        
        this.addButton("left", leftBtn)
        this.addButton("right", rightBtn)
        this.addButton("sprint", sprintBtn)
        this.addButton("jump", jumpBtn)
    }

    // assign each button with corresponding "action" and value to track whether it's pressed or not
    private addButton(
        action: Action,
        btn: Phaser.GameObjects.Image
    ): void {
        const entry: TouchButton ={
            action: action,
            button: btn,
            pressed: false,
        }
        this.buttons.push(entry)

        btn.setInteractive({ useHandCursor: false})
        // Scroll factor 0 so buttons stay put if the camera scrolls.
        btn.setScrollFactor(0)

        btn
            .on("pointerdown", () => {
                entry.pressed = true
            })
            .on("pointerup", () => {
                entry.pressed = false
            })
            .on("pointerupoutside", () => {
                entry.pressed = false
            })
            .on("pointerout", () => {
                entry.pressed = false
            })
    }

    // read current state of the buttons and copy it into out
    sample(out: RawInput): void {
        for(const {action, pressed} of this.buttons){
            if (pressed) {
                out[action] = true
            }
        }
    }

    destroy(): void {
        for (const { button } of this.buttons) {
            button.destroy()
        }
        this.buttons.length = 0
    }
}
