import * as Phaser from 'phaser';
import { BUTTON_SVG_SCALE } from '../config/display';
import { ATLAS, UI_FRAMES } from '../config/atlas';
import { loadMapImages } from '../systems/world/WorldMap';
import { onResize } from '../utils/viewport';
import { BUTTONS } from '../config/input';
import { AudioController } from '../systems/audio/AudioController';

/**
 * Scene where the bulk of the game's assets load, behind a progress bar.
 *
 * Runs after {@link BootScene}, which has already loaded the essential stuff -
 * including the sprite atlas every character, foe, weapon, projectile, pickup and
 * HUD image is drawn from. What's left is driven off {@link BUTTONS}, the audio
 * bank and the map JSON, so adding an entry there is all it takes to get it loaded.
 *
 * When loading is done starts `MainMenuScene`.
 */
export default class PreloadScene extends Phaser.Scene {
    /** red line that grows with load progress */
    private progressBar!: Phaser.GameObjects.Image
    /** frame the progress bar is drawn inside */
    private progressBox!: Phaser.GameObjects.Image

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
     * - touch control button SVGs (up and down textures), rasterized at {@link BUTTON_SVG_SCALE}
     * - every music track, ambience bed and sound effect in the audio bank
     */
    preload() {
        // create a loading graph
        const loadingGraph = this.createLoadingGraph()

        // the bar is drawn in its container, so we only need to move container
        onResize(this, (width, height) => {
            loadingGraph.setPosition(width / 2, height / 2)
        })

        // the whole audio bank, driven off the registries in data/audio.ts
        AudioController.load(this.load)

        // every sheet and backdrop the map names, queued off the map data that
        // BootScene already fetched
        loadMapImages(this)

        // load button textures
        for (const {texture, downTexture} of Object.values(BUTTONS)){
            this.load.svg(texture, `assets/ui/controls/${texture}.svg`, { scale: BUTTON_SVG_SCALE })
            this.load.svg(downTexture, `assets/ui/controls/${downTexture}.svg`, { scale: BUTTON_SVG_SCALE })
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
        const barHeight = 24

        this.progressBox = this.add.image(0, 0, ATLAS, UI_FRAMES["progBar-frame"])

        this.progressBar = this.add.image(0, 0, ATLAS, UI_FRAMES["progBar-line"])

        const percentText = this.add.text(0, barHeight / 2 + 20, "0%", {
            fontSize: "18px",
            color: "#e52554"
        }).setOrigin(0.5)

        this.load.on("progress", (value:number) => {
            // update percent text
            percentText.setText(`${Phaser.Math.RoundTo(value * 100 * 10) / 10}%`)

            // update progress bar
            this.progressBar.setCrop(
                0, 0,
                this.progressBar.width * value,
                this.progressBar.height
            )
        })

        this.load.on("complete", () => {
            console.log("Loaded!")
        })

        return this.add.container(0, 0, [this.progressBox, this.progressBar, percentText])
    }

}
