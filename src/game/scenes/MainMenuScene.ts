import * as Phaser from 'phaser';

export default class MainMenuScene extends Phaser.Scene {
    constructor() {
        super("MainMenuScene")
    }

    create() {
        // add temporary logo
        this.add.bitmapText(
            this.scale.width / 2,
            this.scale.height / 2 - 50,
            "Jacquard24", "Everwood",
            100
        )
        .setOrigin(0.5)
        .setTint(0xA63446)
        .setDropShadow(1, 1, 0xFBFEF9, 1)

        // add temporary start button
        const startButton = this.add.image(
            this.scale.width / 2,
            this.scale.height / 2 + 50,
            "startBtn"
        )
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })

        startButton.on("pointerover", () => startButton.setTint(0xAAAAAA))
        startButton.on("pointerout", () => startButton.clearTint())
        startButton.on("pointerdown", () => {
            this.scene.start("GameScene")
        })
    }
}