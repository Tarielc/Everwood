import * as Phaser from 'phaser';
import { InputSource, RawInput } from './InputSource';
import { TOUCH_CONTROLS, TouchControlsConfig, UI_SCALE_FACTOR } from '../../utils/constants';

type Action = keyof RawInput

interface TouchButton {
    action: Action
    button: Phaser.GameObjects.Image
    pressed: boolean
}

// stand-in art for a button whose png hasn't been drawn yet, generated once per
// texture manager - the same size as the real button sheets, so it scales alike
const FALLBACK_TEXTURE = "touch-btn-fallback"
const FALLBACK_SIZE = 8

export default class TouchSource implements InputSource {
    // for touch device we use array of on-screen buttons
    private buttons: TouchButton[] = []

    constructor(private scene: Phaser.Scene, private config: TouchControlsConfig = TOUCH_CONTROLS) {
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
        
        // stacked above jump rather than beside it - the thumb that swings is the
        // thumb that jumps, and reaching sideways for it fights the movement hand
        const attackBtn = this.scene.add.image(
            width - margin - radius,
            height - margin - radius * 2 - gap,
            this.textureFor("attack-btn"),
        ).setScale(UI_SCALE_FACTOR)

        this.addButton("left", leftBtn)
        this.addButton("right", rightBtn)
        this.addButton("sprint", sprintBtn)
        this.addButton("jump", jumpBtn)
        this.addButton("attack", attackBtn)
    }

    // the real art if it was loaded, a plain disc if it wasn't - drop assets/ui/
    // attack-btn.png in and load it in PreloadScene to replace the placeholder
    private textureFor(key: string): string {
        const textures = this.scene.textures
        if (textures.exists(key)) return key

        if (!textures.exists(FALLBACK_TEXTURE)) {
            const graphics = this.scene.make.graphics({ x: 0, y: 0 }, false)
            graphics.fillStyle(0xffffff, 1)
            graphics.fillCircle(FALLBACK_SIZE / 2, FALLBACK_SIZE / 2, FALLBACK_SIZE / 2)
            graphics.generateTexture(FALLBACK_TEXTURE, FALLBACK_SIZE, FALLBACK_SIZE)
            graphics.destroy()
        }

        return FALLBACK_TEXTURE
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

        const setPressed = (pressed: boolean) => {
            entry.pressed = pressed
            // visible feedback - a touch has no cursor to show what it hit
            btn.setAlpha(pressed ? this.config.pressedAlpha : 1)
        }

        btn
            .on("pointerdown", () => {
                setPressed(true)
            })
            .on("pointerup", () => {
                setPressed(false)
            })
            .on("pointerupoutside", () => {
                setPressed(false)
            })
            .on("pointerout", () => {
                setPressed(false)
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
