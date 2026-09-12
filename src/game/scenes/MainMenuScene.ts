import * as Phaser from 'phaser';
import { enterImmersive, onResize } from '../utils/viewport';

export default class MainMenuScene extends Phaser.Scene {
    constructor() {
        super("MainMenuScene")
    }

    create() {
        // add temporary logo
        const logo = this.add.bitmapText(0, 0, "Jacquard24", "Everwood", 100)
            .setOrigin(0.5)
            .setTint(0xA63446)
            .setDropShadow(1, 1, 0xFBFEF9, 1)

        // add temporary start button
        const startButton = this.add.image(0, 0, "startBtn")
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true })

        // centred off the live size, which under Scale.EXPAND isn't always 1280x720
        onResize(this, (width, height) => {
            logo.setPosition(width / 2, height / 2 - 50)
            startButton.setPosition(width / 2, height / 2 + 50)
        })

        // the menu is skipped for now, so the first tap in the level is the
        // gesture that asks for fullscreen and landscape.
        this.input.once(Phaser.Input.Events.POINTER_UP, () => enterImmersive(this))

        startButton.on("pointerover", () => startButton.setTint(0xAAAAAA))
        startButton.on("pointerout", () => startButton.clearTint())
        // pointerup rather than pointerdown - browsers only grant fullscreen on
        // the release half of a gesture
        startButton.on("pointerup", () => {
            enterImmersive(this)
            this.scene.start("GameScene")
        })
    }
}
