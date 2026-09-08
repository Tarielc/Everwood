import * as Phaser from 'phaser';
import { CHARACTER_FRAME, ITEMS } from '../utils/constants';

export default class PreloadScene extends Phaser.Scene {
    private progressBar!: Phaser.GameObjects.Graphics
    private progressBox!: Phaser.GameObjects.Graphics

    constructor() {
        super("PreloadScene")
    }

    preload() {
        // add background image
        this.add.image(0, 0, "load-bg")
            .setOrigin(0)
            .setDisplaySize(this.scale.width, this.scale.height)

        // create a loading graph
        this.createLoadingGraph()

        // load stuff...
        this.load.image("startBtn", "assets/ui/start-btn.png")

        this.load.spritesheet("player", "assets/sprites/player.png", CHARACTER_FRAME)
        this.load.spritesheet("fox", "assets/sprites/fox.png", { frameWidth: 32, frameHeight: 32 })
        this.load.image("left-btn", "assets/ui/left-btn.png")
        this.load.image("right-btn", "assets/ui/right-btn.png")
        this.load.image("sprint-btn", "assets/ui/sprint-btn.png")
        this.load.image("jump-btn", "assets/ui/jump-btn.png")


        this.load.image("hpBar", "assets/ui/HP-bar.png")
        this.load.image("manaBar", "assets/ui/blue-bar.png")
        this.load.image("healthBar", "assets/ui/red-bar.png")
        this.load.image("staminaBar", "assets/ui/yellow-bar.png")

        // equippable overlays share the player's grid, so they load as spritesheets
        // on the same frame size - driven off the registry, so adding an item to
        // ITEMS is all it takes to get it loaded
        for (const { texture } of Object.values(ITEMS)) {
            this.load.spritesheet(texture, `assets/sprites/${texture}.png`, CHARACTER_FRAME)
        }

    }

    create() {
        this.add.bitmapText(
            this.scale.width / 2,
            this.scale.height / 2 - 50,
            "Jacquard24", "Everwood",
            100
        )
        .setOrigin(0.5)
        .setTint(0xA63446)
        .setDropShadow(1, 1, 0xFBFEF9, 1)

        // start main menu scene after a short delay
        this.time.delayedCall(300, () => {
            this.scene.start("GameScene")
        })
    }

    createLoadingGraph() {
        const { width, height } = this.scale
        const barWidth = 320
        const barHeight = 24

        this.progressBox = this.add.graphics()
        this.progressBox.fillStyle(0x222222, 0.8)
        this.progressBox.fillRect(width / 2 - barWidth / 2, height / 2 - barHeight / 2, barWidth, barHeight)

        this.progressBar = this.add.graphics()

        const percentText = this.add.text(width / 2, height / 2 + barHeight / 2 + 20, "0%", {
            fontSize: "18px",
        }).setOrigin(0.5)

        this.load.on("progress", (value:number) => {
            // update percent text
            percentText.setText(`${Phaser.Math.RoundTo(value * 100 * 10) / 10}%`)
            
            // update progress bar
            this.progressBar.clear()
            this.progressBar.fillStyle(0xffffff, 1)
            this.progressBar.fillRect(
                width / 2 - barWidth / 2 + 4,
                height / 2 - barHeight / 2 + 4,
                (barWidth - 8) * value,
                barHeight - 8
            )
        })

        this.load.on("complete", () => {
            console.log("Loaded!")
        })
    }

}