import * as Phaser from 'phaser';
import { onResize, safeArea } from '../utils/viewport';
import { AudioController } from '../systems/audio/AudioController';

/** Title font size on screens wide enough to fit it */
const TITLE_SIZE = 100
/** Space kept clear on each side of the menu, in game pixels */
const MENU_MARGIN = 24
/** Peak scale of the start button's breathing pulse, relative to its resting size */
const BREATH_SCALE = 1.06
/** Time in ms for one half of the breath (inhale or exhale) */
const BREATH_DURATION = 1200

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
        // add background image
        const background = this.add.image(0, 0, "load-bg").setOrigin(0.5)

        // add temporary logo
        const logo = this.add.bitmapText(0, 0, "Jacquard24", "Everwood", TITLE_SIZE)
            .setOrigin(0.5)
            .setTint(0xFBFEF9)
            .setDropShadow(2, 2, 0xA63446, 1)

        // add temporary start button
        const startButton = this.add.image(0, 0, "startBtn")
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true })

        // scale set by the resize handler; the breathing tween multiplies on top of it
        let baseScale = 1
        let breath = 1

        // slow, endless pulse so the button draws the eye
        this.tweens.addCounter({
            from: 1,
            to: BREATH_SCALE,
            duration: BREATH_DURATION,
            ease: "Sine.easeInOut",
            yoyo: true,
            repeat: -1,
            onUpdate: (tween) => {
                breath = tween.getValue() ?? 1
                startButton.setScale(baseScale * breath)
            }
        })

        // the menu has a voice of its own. a browser gives no audio until the page has
        // been clicked on, so this may well start on the press of the start button -
        // the mixer remembers what was asked for and puts it on the moment it can
        AudioController.instance.playMusic("menu")
        AudioController.instance.playAmbience("town")

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
            logo.setFontSize(Math.floor(TITLE_SIZE * Phaser.Math.Clamp(1, 0.3, maxWidth / logo.width)))

            baseScale = Phaser.Math.Clamp(1, 0.4, maxWidth / startButton.width)
            startButton.setScale(baseScale * breath)

            // keep the gap between title and button proportional to the title
            const gap = logo.fontSize / 2
            const centerX = inset.left + (width - inset.left - inset.right) / 2
            const centerY = inset.top + (height - inset.top - inset.bottom) / 2

            logo.setPosition(centerX, centerY - gap)
            startButton.setPosition(centerX, centerY + gap)

            // background size and scale
            const scale = Math.max(
                this.scale.width / background.width,
                this.scale.height / background.height
            );

            background
                .setDisplaySize(width, height)
                .setScale(scale)
                .setPosition(width / 2, height / 2)
        })

        startButton.on("pointerover", () => startButton.setTint(0xAAAAAA))
        startButton.on("pointerout", () => startButton.clearTint())
        
        // pointerup rather than pointerdown - browsers only grant fullscreen on
        // the release half of a gesture
        startButton.on("pointerup", () => {
            AudioController.instance.play("ui-confirm")
            this.scene.start("GameScene")
        })
    }
}
