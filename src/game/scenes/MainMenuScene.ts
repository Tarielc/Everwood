import * as Phaser from 'phaser';
import { onResize, safeArea } from '../utils/viewport';

/** Title font size on screens wide enough to fit it */
const TITLE_SIZE = 100
/** Space kept clear on each side of the menu, in game pixels */
const MENU_MARGIN = 24

/**
 * Main menu scene before starting the game.
 * 
 * Launches {@link UIScene} and starts {@link GameScene} on button click.
 */
export default class MainMenuScene extends Phaser.Scene {
    /** Constructor */
    constructor() {
        super("MainMenuScene")
    }

    /**
     * Add logo text and button, which are resized
     * Based on screen width
     */
    create() {
        // add temporary logo
        const logo = this.add.bitmapText(0, 0, "Jacquard24", "Everwood", TITLE_SIZE)
            .setOrigin(0.5)
            .setTint(0xA63446)
            .setDropShadow(2, 2, 0xFBFEF9, 1)

        // add temporary start button
        const startButton = this.add.image(0, 0, "startBtn")
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true })

        if (!this.scene.isActive("UIScene")){
            this.scene.launch("UIScene")
        }

        // centred off the live size, which under fitToParent() isn't always 1280x720 -
        // a portrait phone is far narrower than the 100px title
        onResize(this, (width, height) => {
            const inset = safeArea(this.scale)
            const maxWidth = width - inset.left - inset.right - MENU_MARGIN * 2

            // measure at full size, then shrink the font until it fits the width
            logo.setFontSize(TITLE_SIZE)
            logo.setFontSize(Math.floor(TITLE_SIZE * Math.min(1, maxWidth / logo.width)))

            startButton.setScale(Math.min(1, maxWidth / startButton.width))

            // keep the gap between title and button proportional to the title
            const gap = logo.fontSize / 2
            const centerX = inset.left + (width - inset.left - inset.right) / 2
            const centerY = inset.top + (height - inset.top - inset.bottom) / 2

            logo.setPosition(centerX, centerY - gap)
            startButton.setPosition(centerX, centerY + gap)
        })

        startButton.on("pointerover", () => startButton.setTint(0xAAAAAA))
        startButton.on("pointerout", () => startButton.clearTint())
        
        // pointerup rather than pointerdown - browsers only grant fullscreen on
        // the release half of a gesture
        startButton.on("pointerup", () => {
            this.scene.start("GameScene")
        })
    }
}
