import * as Phaser from 'phaser';
import { ATLAS, UI_FRAMES } from '../config/atlas';

/** Each source pixel stays square; text moves with the button during every tween. */
const ART_SCALE = 4
const LABEL_SIZE = 35
const LABEL_Y = -ART_SCALE / 2

/** An atlas button and bitmap label with a single hit area and cancellable press. */
export class MenuButton extends Phaser.GameObjects.Container {
    private readonly art: Phaser.GameObjects.Image
    private readonly label: Phaser.GameObjects.BitmapText
    private ready = false
    private pressedPointer: number | null = null
    private hoverTween?: Phaser.Tweens.Tween

    constructor(
        scene: Phaser.Scene,
        private readonly colour: "yellow" | "red" | "gray",
        text: string,
        choose: () => void,
    ) {
        super(scene, 0, 0)
        scene.add.existing(this)
        this.art = scene.add.image(0, 0, ATLAS, UI_FRAMES[`${colour}-btn-normal`])
            .setScale(ART_SCALE)
        this.label = scene.add.bitmapText(0, LABEL_Y, "Jersey25", text, LABEL_SIZE)
            .setOrigin(0.5)
            .setTint(colour === "yellow" ? 0x302536 : 0xFBFEF9)
        this.add([this.art, this.label])
        this.setSize(this.art.displayWidth, this.art.displayHeight)
            .setInteractive({ useHandCursor: true })

        this.on("pointerover", () => {
            if (this.ready) this.hover(true)
        })
        this.on("pointerout", this.cancelPress, this)
        this.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            if (!this.ready || this.pressedPointer !== null) return
            this.pressedPointer = pointer.id
            this.art.setFrame(UI_FRAMES[`${colour}-btn-pressed`])
            this.label.setY(LABEL_Y + ART_SCALE)
        })
        this.on("pointerup", (pointer: Phaser.Input.Pointer) => {
            if (!this.ready || this.pressedPointer !== pointer.id) return
            this.cancelPress()
            choose()
        })

        // Releases outside the canvas and losing focus must never leave a stuck press.
        const releaseOutside = (pointer: Phaser.Input.Pointer) => {
            if (this.pressedPointer === pointer.id) this.cancelPress()
        }
        scene.input.on("pointerup", releaseOutside)
        scene.input.on("gameout", this.cancelPress, this)
        scene.game.events.on(Phaser.Core.Events.BLUR, this.cancelPress, this)
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            scene.input.off("pointerup", releaseOutside)
            scene.input.off("gameout", this.cancelPress, this)
            scene.game.events.off(Phaser.Core.Events.BLUR, this.cancelPress, this)
        })
    }

    /** Fade in together; invisible buttons cannot accidentally select a destination. */
    reveal(delay: number): void {
        this.ready = false
        this.cancelPress()
        this.scene.tweens.killTweensOf(this)
        this.setScale(1).setAlpha(0)
        this.scene.tweens.add({
            targets: this,
            alpha: 1,
            duration: 250,
            delay,
            ease: "Sine.easeOut",
            onComplete: () => { this.ready = true },
        })
    }

    private hover(on: boolean): void {
        // Replace a running hover from its current scale, without jumping to an endpoint.
        this.hoverTween?.stop()
        this.hoverTween = this.scene.tweens.add({
            targets: this,
            scale: on ? 1.04 : 1,
            duration: 120,
            ease: "Sine.easeOut",
        })
    }

    private cancelPress(): void {
        this.pressedPointer = null
        this.art.setFrame(UI_FRAMES[`${this.colour}-btn-normal`])
        this.label.setY(LABEL_Y)
        this.hover(false)
    }
}
