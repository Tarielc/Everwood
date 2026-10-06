import * as Phaser from 'phaser';
import { hudScale, onResize, safeArea } from '../utils/viewport';
import { UI_SCALE_FACTOR } from '../config/display';
import { UI_BUTTONS } from '../config/ui';
import { AudioController } from '../systems/audio/AudioController';
import { MenuButton } from '../ui/MenuButton';
import type { LeaderboardSceneData } from './LeaderboardScene';
import { EventBus } from '../utils/EventBus';
import { PauseEvent } from '../utils/PauseEvents';

/** Design sizes; the whole menu shrinks together on narrow screens. */
const TITLE_SIZE = 100
const MENU_MARGIN = 24
const TITLE_GAP = 32
const BUTTON_GAP = 20
const HINT_SIZE = 24

/** Main menu, with level selection and a read-only visit to the leaderboard. */
export default class MainMenuScene extends Phaser.Scene {
    constructor() {
        super("MainMenuScene")
    }

    create() {
        const background = this.add.image(0, 0, "load-bg").setOrigin(0.5)
        const logo = this.add.bitmapText(0, 0, "Jacquard24", "Everwood", TITLE_SIZE)
            .setOrigin(0.5, 0)
            .setTint(0xFBFEF9)
            .setDropShadow(2, 2, 0xA63446, 1)

        // Layout scales this parent; hover animations only scale its children.
        const content = this.add.container(0, 0, [logo])
        let leaving = false
        const choose = (action: () => void) => {
            if (leaving) return
            leaving = true
            AudioController.instance.play("ui-confirm")
            action()
        }

        const buttons = [
            new MenuButton(this, "yellow", "ranked", () => choose(() => {
                // Always supply the level so a previous run cannot leak into this one.
                this.scene.start("GameScene", { level: "arena" })
            })),
            new MenuButton(this, "red", "platformer", () => choose(() => {
                this.scene.start("GameScene", { level: "nether" })
            })),
            new MenuButton(this, "gray", "leaderboard", () => choose(() => {
                // Keep the background under the board, with the menu hidden and paused.
                content.setVisible(false)
                landscapeHint.setVisible(false)
                this.scene.pause()
                this.scene.launch("LeaderboardScene", {
                    run: undefined,
                    onBack: () => {
                        leaving = false
                        content.setVisible(true)
                        this.scene.resume()
                        layout(this.scale.width, this.scale.height)
                        buttons.forEach((button, index) => button.reveal(index * 70))
                    },
                } satisfies LeaderboardSceneData)
                this.scene.bringToTop("UIScene")
            })),
        ]

        buttons.forEach((button, index) => {
            content.add(button)
            button.setPosition(0, logo.height + TITLE_GAP + button.height / 2
                + index * (button.height + BUTTON_GAP))
            button.reveal(index * 70)
        })

        const contentWidth = Math.max(logo.width, ...buttons.map(button => button.width * 1.04))
        const lastButton = buttons[buttons.length - 1]
        const contentHeight = lastButton.y + lastButton.height * 1.04 / 2

        const landscapeHint = this.add.bitmapText(0, 0, "Jersey25",
            "For the best experience, play in landscape mode", HINT_SIZE)
            .setOrigin(0.5, 1)
            .setCenterAlign()
            .setTint(0xFBFEF9)
            .setDropShadow(1, 1, 0x000000, 1)

        AudioController.instance.playMusic("menu")
        AudioController.instance.playAmbience("town")
        if (!this.scene.isActive("UIScene")) this.scene.launch("UIScene")

        const layout = (width: number, height: number) => {
            const inset = safeArea(this.scale)
            const maxWidth = Math.max(1, width - inset.left - inset.right - MENU_MARGIN * 2)
            const centerX = inset.left + (width - inset.left - inset.right) / 2
            const portrait = height > width

            landscapeHint.setVisible(portrait && !leaving)
                .setMaxWidth(maxWidth)
                .setPosition(centerX, height - inset.bottom - MENU_MARGIN)

            // Leave room above the menu for the persistent sound/fullscreen controls.
            const uiRatio = hudScale(UI_SCALE_FACTOR, width, height) / UI_SCALE_FACTOR
            const controlsHeight = UI_BUTTONS.margin + UI_BUTTONS.radius * uiRatio
                + (portrait ? 2 * (UI_BUTTONS.radius + UI_BUTTONS.gap) * uiRatio : 0)
            const top = inset.top + controlsHeight + MENU_MARGIN
            const bottom = height - inset.bottom - MENU_MARGIN
                - (portrait ? landscapeHint.height + MENU_MARGIN : 0)
            const availableHeight = Math.max(1, bottom - top)
            const scale = Math.min(1, maxWidth / contentWidth, availableHeight / contentHeight)
            content.setScale(scale)
                .setPosition(centerX, top + (availableHeight - contentHeight * scale) / 2)

            background.setScale(Math.max(width / background.width, height / background.height))
                .setPosition(width / 2, height / 2)
        }
        onResize(this, layout)

        // hide pause button
        EventBus.emit(PauseEvent.Hide)
    }
}
