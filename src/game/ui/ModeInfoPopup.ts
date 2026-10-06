import * as Phaser from 'phaser';
import { MenuPopup } from './MenuPopup';

/** An HTML dialog comparing the two modes, owned by the main menu scene. */
export class ModeInfoPopup extends MenuPopup {
    constructor(scene: Phaser.Scene) {
        super(scene, "mode-info-popup", "mode-info-title", `
            <h2 id="mode-info-title" tabindex="-1" autofocus>Choose your mode</h2>
            <p class="menu-popup-intro">Two ways to play Everwood.</p>
            <div class="menu-popup-columns mode-info-modes">
                <section class="mode-info-ranked" aria-labelledby="mode-info-ranked-title">
                    <h3 id="mode-info-ranked-title">Ranked</h3>
                    <p class="menu-popup-tagline">Endless arena survival</p>
                    <p>Fight increasingly difficult waves of enemies and survive as long as you can.</p>
                    <p>Your run is ranked by <strong>wave reached</strong>, then by <strong>kills</strong>.
                        After defeat, open the leaderboard to submit your name and score.</p>
                </section>
                <section class="mode-info-platformer" aria-labelledby="mode-info-platformer-title">
                    <h3 id="mode-info-platformer-title">Platformer</h3>
                    <p class="menu-popup-tagline">A journey to the final boss</p>
                    <p>Jump through the Nether, overcome hazards and enemies, and use checkpoints along the way.</p>
                    <p>Reach and defeat the final boss to win. Platformer runs
                        <strong>do not appear on the leaderboard</strong>.</p>
                </section>
            </div>
        `)
    }
}
