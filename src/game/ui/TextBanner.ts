import * as Phaser from 'phaser';

import { TEXT_WAVE_BANNER, TextBannerConfig } from '../config/ui';
import { onResize, safeArea } from '../utils/viewport';

/**
 * The "Wave 3" headline an arena announces itself with.
 *
 * A plain game object rather than a scene, because it belongs to the level being
 * fought and should leave with it - unlike the HUD, which outlives a level change.
 * It is pinned to the camera and drawn over everything, so it reads wherever the
 * player happens to be standing when a wave lands.
 */
export class TextBanner {
    /** The headline itself, empty and invisible until something is announced */
    private readonly text: Phaser.GameObjects.BitmapText

    /** The fade currently playing, stopped if a new announcement interrupts it */
    private tween?: Phaser.Tweens.Tween

    /**
     * @param scene - Scene to draw the banner over
     * @param config - Font, placement and timing
     */
    constructor(
        private readonly scene: Phaser.Scene,
        private readonly config: TextBannerConfig = TEXT_WAVE_BANNER,
    ) {
        this.text = scene.add.bitmapText(0, 0, config.font, "", config.size)
            .setOrigin(0.5)
            // pinned to the camera - the world scrolls underneath it
            .setScrollFactor(0)
            .setAlpha(0)

        // centred off the live view, which under fitToParent() isn't always 1280x720,
        // and kept clear of whatever a phone's notch is covering
        onResize(scene, (width, height) => {
            const inset = safeArea(scene.scale)

            this.text.setPosition(
                inset.left + (width - inset.left - inset.right) / 2,
                inset.top + (height - inset.top - inset.bottom) * config.y,
            )
        })
    }

    /**
     * Put a line up, hold it, and take it back down
     *
     * @param message - What to say, e.g. `"Wave 3"`
     */
    announce(message: string, shouldFade:boolean = false, config: TextBannerConfig = TEXT_WAVE_BANNER): void {
        // a wave cleared in less time than the last announcement takes to fade is
        // rare, but it shouldn't leave two of them fighting over the same text
        this.tween?.stop()
        this.text.setText(message).setAlpha(0)
            .setFont(config.font)
            .setTint(config.tint)
            .setDropShadow(2, 2, config.shadow, 1)

        if (shouldFade) {
            this.tween = this.scene.tweens.add({
                targets: this.text,
                alpha: 1,
                duration: this.config.fadeMs,
                hold: this.config.holdMs,
                yoyo: true,
            })
        }
    }

    /** Destructor and cleanup */
    destroy(): void {
        this.tween?.stop()
        this.tween = undefined
        this.text.destroy()
    }
}
