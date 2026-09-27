import * as Phaser from 'phaser';
import { END_SCREEN, EndScreenConfig } from '../config/ui';
import { onResize, safeArea } from '../utils/viewport';
import { AudioController } from '../systems/audio/AudioController';

/** How a run ended - picks the headline, its colour and what the first option says */
export type EndOutcome = "victory" | "defeat"

export interface EndSceneData {
    outcome: EndOutcome,
    /** Go again - what that means is up to whoever launched the screen */
    onRetry: () => void,
    /** Leave for the main menu */
    onMenu: () => void,
}

/** Everything that differs between a win and a death */
const OUTCOMES: Record<EndOutcome, { title: string, subtitle: string, retry: string, tint: "victoryTint" | "defeatTint" }> = {
    victory: {
        title: "Victory",
        subtitle: "The arena falls silent",
        retry: "Play Again",
        tint: "victoryTint",
    },
    defeat: {
        title: "You Died",
        subtitle: "The abyss claims another",
        retry: "Try Again",
        tint: "defeatTint",
    },
}

/**
 * The screen a run ends on - a win or a death - drawn over the paused level.
 *
 * A scene of its own rather than a game object in {@link GameScene}, because the level
 * is paused underneath it and a paused scene takes no input. It knows nothing about
 * levels or progress: the scene that launched it says what each choice does.
 */
export default class EndScene extends Phaser.Scene {
    private outcome: EndOutcome = "defeat"
    private onRetry: () => void = () => {}
    private onMenu: () => void = () => {}

    private options: Phaser.GameObjects.BitmapText[] = []
    /** Which option the keyboard is on, -1 for none */
    private selected: number = -1
    /** Nothing is picked until the screen is fully up, so a button mashed mid-fight doesn't land on it */
    private ready: boolean = false
    /** The first pick wins - the scene is on its way out after it */
    private chosen: boolean = false

    constructor(private readonly config: EndScreenConfig = END_SCREEN) {
        super("EndScene")
    }

    // a relaunched scene is the same instance, so every run starts from scratch
    init(data: EndSceneData) {
        this.outcome = data.outcome
        this.onRetry = data.onRetry
        this.onMenu = data.onMenu
        this.options = []
        this.selected = -1
        this.ready = false
        this.chosen = false
    }

    create() {
        const config = this.config
        const outcome = OUTCOMES[this.outcome]

        const backdrop = this.add.rectangle(0, 0, 1, 1, config.backdropColour, config.backdropAlpha)
            .setOrigin(0)
            // swallows clicks, so nothing underneath can be pressed through it
            .setInteractive()

        const title = this.add.bitmapText(0, 0, config.titleFont, outcome.title, config.titleSize)
            .setOrigin(0.5)
            .setTint(config[outcome.tint])
            .setDropShadow(3, 3, config.shadow, 1)

        const subtitle = this.add.bitmapText(0, 0, config.subtitleFont, outcome.subtitle, config.subtitleSize)
            .setOrigin(0.5)
            .setTint(config.subtitleTint)
            .setDropShadow(2, 2, config.shadow, 1)

        // each one is added to `options` as it's made, which is what gives it its index
        this.addOption(outcome.retry, () => this.onRetry())
        this.addOption("Main Menu", () => this.onMenu())

        const content = [title, subtitle, ...this.options]

        onResize(this, (width, height) => {
            const inset = safeArea(this.scale)
            const maxWidth = width - inset.left - inset.right - config.margin * 2

            backdrop.setSize(width, height)

            // a portrait phone is narrower than the headline - shrink it until it fits
            title.setFontSize(config.titleSize)
            title.setFontSize(Math.floor(config.titleSize * Phaser.Math.Clamp(maxWidth / title.width, 0.3, 1)))

            const centerX = inset.left + (width - inset.left - inset.right) / 2
            const centerY = inset.top + (height - inset.top - inset.bottom) / 2

            // stacked from the middle up and down, so the block stays centred whatever the title's size
            const optionsHeight = this.options.length * config.optionSize + (this.options.length - 1) * config.gap
            const total = title.height + config.gap / 2 + subtitle.height + config.gap * 2 + optionsHeight
            let y = centerY - total / 2

            title.setPosition(centerX, y + title.height / 2)
            y += title.height + config.gap / 2
            subtitle.setPosition(centerX, y + subtitle.height / 2)
            y += subtitle.height + config.gap * 2

            for (const option of this.options) {
                option.setPosition(centerX, y + config.optionSize / 2)
                y += config.optionSize + config.gap
            }
        })

        backdrop.setAlpha(0)
        content.forEach(item => item.setAlpha(0))

        this.tweens.add({
            targets: [backdrop, ...content],
            alpha: 1,
            duration: config.fadeInMs,
            ease: "Sine.easeOut",
            onComplete: () => { this.ready = true },
        })

        this.bindKeys()
    }

    private addOption(label: string, choose: () => void): Phaser.GameObjects.BitmapText {
        const option = this.add.bitmapText(0, 0, this.config.optionFont, label, this.config.optionSize)
            .setOrigin(0.5)
            .setTint(this.config.optionTint)
            .setDropShadow(2, 2, this.config.shadow, 1)
            .setInteractive({ useHandCursor: true })

        const index = this.options.length

        option.on("pointerover", () => this.select(index))
        option.on("pointerout", () => this.select(-1))
        // pointerup rather than pointerdown - browsers only grant fullscreen on the release
        // half of a gesture, and the menu this can lead to asks for it
        option.on("pointerup", () => this.choose(choose))
        option.setData("choose", choose)

        this.options.push(option)
        return option
    }

    // arrows or WASD to move between the options, enter or space to take one
    private bindKeys(): void {
        const keyboard = this.input.keyboard
        if (!keyboard) return

        const move = (step: number) => {
            const count = this.options.length
            this.select(this.selected < 0 ? 0 : (this.selected + step + count) % count)
        }

        keyboard.on("keydown-UP", () => move(-1))
        keyboard.on("keydown-W", () => move(-1))
        keyboard.on("keydown-DOWN", () => move(1))
        keyboard.on("keydown-S", () => move(1))

        const confirm = () => {
            const option = this.options[Math.max(this.selected, 0)]
            this.choose(option.getData("choose"))
        }
        keyboard.on("keydown-ENTER", confirm)
        keyboard.on("keydown-SPACE", confirm)
    }

    private select(index: number): void {
        if (index === this.selected) return
        this.selected = index

        this.options.forEach((option, i) => {
            option.setTint(i === index ? this.config.optionHoverTint : this.config.optionTint)
        })

        if (index >= 0 && this.ready) AudioController.instance.play("ui-click")
    }

    private choose(choose: () => void): void {
        if (!this.ready || this.chosen) return
        this.chosen = true

        AudioController.instance.play("ui-confirm")

        // out of the way first - what the choice does may well restart the scene under it
        this.scene.stop()
        choose()
    }
}
