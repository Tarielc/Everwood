import * as Phaser from 'phaser';
import { BUTTON_SVG_SCALE, CHARACTER_FRAME } from '../config/display';
import { FOES } from '../data/foes';
import { ITEMS } from '../data/items';
import { PROJECTILES } from '../data/projectiles';
import { loadMapImages } from '../systems/world/WorldMap';
import { onResize } from '../utils/viewport';
import { BUTTONS } from '../config/input';

/**
 * Scene where the bulk of the game's assets load, behind a progress bar.
 *
 * Runs after {@link BootScene}, which has already loaded the essential stuff.
 * Most loads are driven off data registries ({@link FOES}, {@link PROJECTILES},
 * {@link BUTTONS}, {@link ITEMS}) and the map JSON, so adding an entry there is
 * all it takes to get its art loaded.
 *
 * When loading is done starts `MainMenuScene`.
 */
export default class PreloadScene extends Phaser.Scene {
    /** white fill that grows with load progress */
    private progressBar!: Phaser.GameObjects.Graphics
    /** dark frame the progress bar is drawn inside */
    private progressBox!: Phaser.GameObjects.Graphics

    /**
     * Only the `Loader` and `Clock` plugins are needed - the loader for
     * {@link preload}, the clock for the delayed hand-off in {@link create}.
     */
    constructor() {
        super({
            key: "PreloadScene",
            plugins: ["Loader", "Clock"]
        })
    }

    /**
     * Builds the loading screen, then queues every asset the game needs.
     *
     * The loading screen is laid out through {@link onResize}, so it stays
     * centered and the background keeps covering the screen as the viewport
     * changes while loading.
     *
     * Queued here:
     * - map tileset sheets and backdrops, via {@link loadMapImages}
     * - player spritesheet, and equippable item overlays on the same {@link CHARACTER_FRAME}
     * - foe spritesheets, each cut on the frame size its definition declares
     * - projectile images
     * - touch control button SVGs (up and down textures), rasterized at {@link BUTTON_SVG_SCALE}
     * - HUD bars, start and fullscreen buttons
     */
    preload() {
        // add background image
        const background = this.add.image(0, 0, "load-bg").setOrigin(0)

        // create a loading graph
        const loadingGraph = this.createLoadingGraph()

        // the bar is drawn in its container, so we only need to move container
        onResize(this, (width, height) => {
            const scale = Math.max(
                this.scale.width / background.width,
                this.scale.height / background.height
            );

            background
                .setDisplaySize(width, height)
                .setScale(scale);

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

        this.load.image("fullscreen-enter", "assets/ui/fullscreen-enter-btn.png")
        this.load.image("fullscreen-exit", "assets/ui/fullscreen-exit-btn.png")

        // equippable overlays share the player's grid, so they load as spritesheets
        // on the same frame size - driven off the registry, so adding an item to
        // ITEMS is all it takes to get it loaded
        for (const { texture } of Object.values(ITEMS)) {
            this.load.spritesheet(texture, `assets/sprites/${texture}.png`, CHARACTER_FRAME)
        }
    }

    /**
     * Runs after everuthing loaded
     * Starts `MainMenuScene` after a short delay, so the full bar is seen.
     */
    create() {
        // start main menu scene after a short delay
        this.time.delayedCall(300, () => {
            this.scene.start("MainMenuScene")
        })
    }

    /**
     * Creates the progress bar and percent text, and wires them to the
     * loader's `progress` event.
     *
     * Everything is drawn relative to (0, 0) - the returned container is what
     * gets placed at the center of the screen, so resizing only moves it.
     *
     * @returns container holding the bar frame, the bar, and the percent text
     */
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
