import * as Phaser from 'phaser';
import { Action, InputSource, RawInput } from './InputSource';
import { BUTTON_SVG_SCALE } from '../../config/display';
import { BUTTONS, TOUCH_CONTROLS, TouchControlsConfig } from '../../config/input';
import { onResize, safeArea } from '../../utils/viewport';

interface TouchButton {
    action: Action
    button: Phaser.GameObjects.Image
    pressed: boolean
    // ids of the pointers holding this button down - two fingers can share one
    pointers: Set<number>
}

export default class TouchSource implements InputSource {
    // for touch device we use array of on-screen buttons
    private buttons: TouchButton[] = []

    // stops the buttons following resizes once this source is destroyed
    private stopLayout: () => void

    constructor(private scene: Phaser.Scene, private config: TouchControlsConfig = TOUCH_CONTROLS) {
        scene.input.addPointer(config.maxTouches - 1)

        // create control buttons - placed by layout(), since where they go
        // depends on the screen size at the time
        for (const {action, texture, downTexture} of Object.values(BUTTONS)){
            // pixelArt makes every texture NEAREST - the buttons are vector art, so
            // both states get smooth filtering, or pressing one turns it blocky
            for (const key of [texture, downTexture]) {
                this.scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR)
            }
            // the SVGs are rasterised at BUTTON_SVG_SCALE, so draw them back down
            // to their authored size
            this.addButton(action, this.scene.add.image(0, 0, texture).setScale(1.2 / BUTTON_SVG_SCALE))
        }

        this.stopLayout = onResize(scene, (width, height) => this.layout(width, height))

        scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp)
        scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp)
    }

    /**
     * Distribute action buttons on the new resized screen 
     * 
     * @param width - New scale width after resize
     * @param height  - New scale height after resize
     */
    private layout(width: number, height: number): void {
        const { radius, margin, gap } = this.config
        const inset = safeArea(this.scene.scale)

        const left = margin + inset.left
        const right = width - margin - inset.right
        const bottom = height - margin - inset.bottom - radius

        const positions: Record<Action, [number, number]> = {
            left: [left + radius, bottom],
            right: [left + radius * 2 + gap, bottom],
            jump: [right - radius, bottom],
            sprint: [right - radius * 2 - gap, bottom],
            // stacked above jump rather than beside it - the thumb that swings is the
            // thumb that jumps, and reaching sideways for it fights the movement hand
            attack: [right - radius, bottom - radius - gap],
        }

        for (const { action, button } of this.buttons) {
            button.setPosition(...positions[action])
        }
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
            pointers: new Set(),
        }
        this.buttons.push(entry)

        // the art is 8x8, so the default hit area is a thumb-sized target only by
        // luck - grow it past the drawn circle instead. Geometry is in texture
        // pixels, the sprite's own scale is applied on top of it
        const { width, height } = btn
        btn.setInteractive(
            new Phaser.Geom.Circle(width / 2, height / 2, (width / 2) * this.config.hitRadiusScale),
            Phaser.Geom.Circle.Contains
        )

        // Scroll factor 0 so buttons stay put if the camera scrolls.
        btn.setScrollFactor(0)
        // above the world, so nothing the player walks behind can cover the controls
        btn.setDepth(this.config.depth)

        btn.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            entry.pointers.add(pointer.id)
            this.setPressed(entry, true)
        })
    }

    private setPressed(entry: TouchButton, pressed: boolean): void {
        entry.pressed = pressed
        // visible feedback - a touch has no cursor to show what it hit
        entry.button.setTexture(pressed ? `${entry.action}-btn-down` : `${entry.action}-btn`)
    }

    // a press is held by the finger that made it, not by the button's area - sliding
    // off the button keeps it down, and only lifting that finger (anywhere, even
    // off the canvas) lets it go. The button itself only hears "pointerup" if the
    // finger is still over it, so the release is caught at the scene level
    private readonly onPointerUp = (pointer: Phaser.Input.Pointer): void => {
        for (const entry of this.buttons) {
            if (entry.pointers.delete(pointer.id) && entry.pointers.size === 0) {
                this.setPressed(entry, false)
            }
        }
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
        this.stopLayout()
        this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp)
        this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp)
        for (const { button } of this.buttons) {
            button.destroy()
        }
        this.buttons.length = 0
    }
}
