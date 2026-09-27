import * as Phaser from 'phaser';

import { WAVE_COUNTER, WaveCounterConfig } from '../config/ui';
import { onResize, safeArea } from '../utils/viewport';

/**
 * The standing "Wave 3" at the top of the screen, so the player can tell which wave
 * they're on long after the banner announcing it has faded.
 *
 * Like {@link TextBanner} it's a plain game object rather than a scene - it belongs
 * to the arena being fought and leaves with it on a level change.
 */
export class WaveCounter {
    /** The readout itself, hidden until the first wave lands */
    private readonly text: Phaser.GameObjects.BitmapText

    /**
     * @param scene - Scene to draw the counter over
     * @param config - Font and placement
     */
    constructor(
        scene: Phaser.Scene,
        config: WaveCounterConfig = WAVE_COUNTER,
    ) {
        this.text = scene.add.bitmapText(0, 0, config.font, "", config.size)
            .setOrigin(0.5, 0)
            // pinned to the camera - the world scrolls underneath it
            .setScrollFactor(0)
            .setDepth(config.depth)
            .setTint(config.tint)
            .setDropShadow(2, 2, config.shadow, 1)
            .setVisible(false)

        // centred off the live view and kept clear of whatever a phone's notch is covering
        onResize(scene, (width) => {
            const inset = safeArea(scene.scale)

            this.text.setPosition(
                inset.left + (width - inset.left - inset.right) / 2,
                inset.top + config.margin,
            )
        })
    }

    /**
     * Show which wave is being fought
     *
     * @param wave - The wave number, counting from 1
     */
    set(wave: number): void {
        this.text.setText(`Wave ${wave}`).setVisible(true)
    }

    /** Destructor and cleanup */
    destroy(): void {
        this.text.destroy()
    }
}
