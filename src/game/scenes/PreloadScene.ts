import * as Phaser from 'phaser';
import { CHARACTER_FRAME, FOES, ITEMS, PROJECTILES } from '../utils/constants';
import { loadMapImages } from '../systems/world/WorldMap';
import { onResize } from '../utils/viewport';
import { BUTTON_SVG_SCALE, BUTTONS } from '../config/input';

export default class PreloadScene extends Phaser.Scene {
    private progressBar!: Phaser.GameObjects.Graphics
    private progressBox!: Phaser.GameObjects.Graphics

    constructor() {
        super({
            key: "PreloadScene",
            plugins: ["Loader", "Clock"]
        })
    }

    preload() {
        // add background image
        const background = this.add.image(0, 0, "load-bg").setOrigin(0)

        // create a loading graph
        const loadingGraph = this.createLoadingGraph()

        // he bar is drawn in its container, so we only need to move container
        onResize(this, (width, height) => {
            background.setDisplaySize(width, height)
            loadingGraph.setPosition(width / 2, height / 2)
        })

        // load stuff...
        this.load.image("startBtn", "assets/ui/start-btn.png")

        // every sheet and backdrop the map names, queued off the map data that
        // BootScene already fetched
        loadMapImages(this)

        this.load.spritesheet("player", "assets/sprites/player.png", CHARACTER_FRAME)

        // foes bring their own grid, so each loads on the frame size it declares
        for (const { texture, frame } of Object.values(FOES)) {
            this.load.spritesheet(texture, `assets/sprites/${texture}.png`, frame)
        }

        // whatever those foes throw - one frame each, so no sheet to cut
        for (const { texture } of Object.values(PROJECTILES)) {
            this.load.image(texture, `assets/sprites/${texture}.png`)
        }

        // load button textures
        for (const {texture, downTexture} of Object.values(BUTTONS)){
            this.load.svg(texture, `assets/ui/controls/${texture}.svg`, { scale: BUTTON_SVG_SCALE })
            this.load.svg(downTexture, `assets/ui/controls/${downTexture}.svg`, { scale: BUTTON_SVG_SCALE })
        }

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
        const title = this.add.bitmapText(0, 0, "Jacquard24", "Everwood", 100)
            .setOrigin(0.5)
            .setTint(0xA63446)
            .setDropShadow(1, 1, 0xFBFEF9, 1)

        // Text needs to be in center for every new resize
        onResize(this, (width, height) => title.setPosition(width / 2, height / 2 - 50))

        // start main menu scene after a short delay
        this.time.delayedCall(300, () => {
            this.scene.start("MainMenuScene")
        })
    }

    // everything is drawn relative to (0, 0) - the returned container is what
    // gets placed at the centre of the screen
    createLoadingGraph(): Phaser.GameObjects.Container {
        const barWidth = 320
        const barHeight = 24

        this.progressBox = this.add.graphics()
        this.progressBox.fillStyle(0x222222, 0.8)
        this.progressBox.fillRect(-barWidth / 2, -barHeight / 2, barWidth, barHeight)

        this.progressBar = this.add.graphics()

        const percentText = this.add.text(0, barHeight / 2 + 20, "0%", {
            fontSize: "18px",
        }).setOrigin(0.5)

        this.load.on("progress", (value:number) => {
            // update percent text
            percentText.setText(`${Phaser.Math.RoundTo(value * 100 * 10) / 10}%`)

            // update progress bar
            this.progressBar.clear()
            this.progressBar.fillStyle(0xffffff, 1)
            this.progressBar.fillRect(
                -barWidth / 2 + 4,
                -barHeight / 2 + 4,
                (barWidth - 8) * value,
                barHeight - 8
            )
        })

        this.load.on("complete", () => {
            console.log("Loaded!")
        })

        return this.add.container(0, 0, [this.progressBox, this.progressBar, percentText])
    }

}
