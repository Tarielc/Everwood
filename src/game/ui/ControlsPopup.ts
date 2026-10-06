import * as Phaser from 'phaser';
import { MenuPopup } from './MenuPopup';

/** Keyboard and touch instructions, including sprinting and both jumps. */
export class ControlsPopup extends MenuPopup {
    constructor(scene: Phaser.Scene) {
        super(scene, "controls-popup", "controls-title", `
            <h2 id="controls-title" tabindex="-1" autofocus>Controls</h2>
            <p class="menu-popup-intro">Find your footing, then take on the fight.</p>
            <div class="menu-popup-columns">
                <section aria-labelledby="controls-keyboard-title">
                    <h3 id="controls-keyboard-title">Keyboard</h3>
                    <dl class="controls-bindings">
                        <div><dt>Move</dt><dd><kbd>A</kbd> / <kbd>D</kbd> or
                            <kbd aria-label="Left arrow">&larr;</kbd> / <kbd aria-label="Right arrow">&rarr;</kbd></dd></div>
                        <div><dt>Sprint</dt><dd>Hold <kbd>Shift</kbd> while moving,
                            or double-tap a direction and hold.</dd></div>
                        <div><dt>Jump</dt><dd><kbd>Space</kbd>, <kbd>W</kbd>,
                            or <kbd aria-label="Up arrow">&uarr;</kbd></dd></div>
                        <div><dt>Attack</dt><dd><kbd>F</kbd> or <kbd>J</kbd> for each swing.</dd></div>
                        <div><dt>Weapon</dt><dd><kbd>1</kbd> for sword;<br><kbd>0</kbd> for bare hands.</dd></div>
                        <div><dt>Pause</dt><dd><kbd>Esc</kbd> to pause or resume.</dd></div>
                    </dl>
                </section>
                <section aria-labelledby="controls-touch-title">
                    <h3 id="controls-touch-title">Touch</h3>
                    <dl class="controls-bindings">
                        <div><dt>Move</dt><dd>Hold the left or right button.</dd></div>
                        <div><dt>Sprint</dt><dd>Double-tap a direction button and hold the second tap.</dd></div>
                        <div><dt>Jump</dt><dd>Tap the jump button.</dd></div>
                        <div><dt>Attack</dt><dd>Tap the attack button for each swing.</dd></div>
                        <div><dt>Weapon</dt><dd>Switching weapons uses the keyboard shortcuts.</dd></div>
                        <div><dt>Pause</dt><dd>Tap the pause button to pause or resume.</dd></div>
                    </dl>
                </section>
            </div>
            <p class="controls-tip"><strong>Double jump:</strong> Release and press jump again in midair.
                Hold either jump for more height; release early for a shorter jump.
                Landing restores both jumps.</p>
        `)
    }
}
