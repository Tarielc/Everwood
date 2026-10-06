import * as Phaser from 'phaser';
import { END_SCREEN, EndScreenConfig } from '../config/ui';
import { onResize, safeArea } from '../utils/viewport';
import { AudioController } from '../systems/audio/AudioController';
import type { ArenaRun, LeaderboardSceneData } from './LeaderboardScene';
import { PauseEvent } from '../utils/PauseEvents';
import { EventBus } from '../utils/EventBus';

/** How a run ended - picks the headline, its colour and what the first option says */
export type EndOutcome = "victory" | "defeat" | "pause"

/** What the scene that launches the end screen hands it */
export interface EndSceneData {
    /** Whether the run was won or lost */
    outcome: EndOutcome,
    /** Go again - what that means is up to whoever launched the screen */
    onRetry: () => void,
    /** Leave for the main menu */
    onMenu: () => void,
    /** Continue the game */
    onContinue?: () => void,
    /** A ranked arena run - the screen says how deep it got and offers the leaderboard */
    run?: ArenaRun,
}

/**
 * Everything that differs between a win and a death - the headline, the line under it,
 * the label of the first option and which {@link EndScreenConfig} tint colours the headline
 */
const OUTCOMES: Record<EndOutcome, { title: string, subtitle: string, retry: string, tint: "victoryTint" | "defeatTint" | "pauseTint" }> = {
    victory: {
        title: "Victory",
        subtitle: "The underworld falls silent",
        retry: "Play Again",
        tint: "victoryTint",
    },
    defeat: {
        title: "You Died",
        subtitle: "The abyss claims another",
        retry: "Try Again",
        tint: "defeatTint",
    },
    pause: {
        title: "Game Paused",
        subtitle: "press ESC to continue",
        retry: "Try Again",
        tint: "pauseTint"
    }
}

/**
 * The screen a run ends on - a win or a death - drawn over the paused level.
 *
 * A scene of its own rather than a game object in {@link GameScene}, because the level
 * is paused underneath it and a paused scene takes no input. It knows nothing about
 * levels or progress: the scene that launched it says what each choice does.
 */
export default class EndScene extends Phaser.Scene {
    /** How the run ended - picks what the screen says */
    private outcome: EndOutcome = "defeat"
    /** What "Try Again" / "Play Again" does, handed in by the launching scene */
    private onRetry: () => void = () => {}
    /** What "Main Menu" does, handed in by the launching scene */
    private onMenu: () => void = () => {}
    /** What "Continue" doed, handed by the launching scene */
    private onContinue?: () => void | undefined = () => {}
    /** Everything this screen was opened with, so coming back from the leaderboard can reopen it as it was */
    private launchData!: EndSceneData

    /** The choices, top to bottom - an option's index here is what selection goes by */
    private options: Phaser.GameObjects.BitmapText[] = []
    /** Which option the keyboard is on, -1 for none */
    private selected: number = -1
    /** Nothing is picked until the screen is fully up, so a button mashed mid-fight doesn't land on it */
    private ready: boolean = false
    /** The first pick wins - the scene is on its way out after it */
    private chosen: boolean = false

    private readonly stopSceneOnResume = () => {
        this.scene.stop()
    }

    /**
     * Registers the scene under the `EndScene` key.
     *
     * @param config - layout, fonts and colours of the screen, defaults to `END_SCREEN`
     */
    constructor(private readonly config: EndScreenConfig = END_SCREEN) {
        super("EndScene")
    }

    /**
     * A relaunched scene is the same instance, so every run starts from scratch -
     * the launch data is taken in and everything else is reset.
     *
     * @param data - the outcome, what each choice does, and the ranked run if there is one
     */
    init(data: EndSceneData) {
        this.outcome = data.outcome
        this.onRetry = data.onRetry
        this.onMenu = data.onMenu
        this.onContinue = data.onContinue
        this.launchData = data
        this.options = []
        this.selected = -1
        this.ready = false
        this.chosen = false
    }

    get endSceneType(): string {
        return this.outcome
    }

    /**
     * Build the screen: a click-swallowing backdrop, the headline, the subtitle and the
     * options - retry, the leaderboard on a ranked run, and the main menu.
     *
     * The block is laid out centred in the safe area and redone on every resize. Everything
     * fades in, and no option can be picked until the fade has finished.
     */
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

        const subtitle = this.add.bitmapText(0, 0, config.subtitleFont, this.subtitleText(outcome.subtitle), config.subtitleSize)
            .setOrigin(0.5)
            .setTint(config.subtitleTint)
            .setDropShadow(2, 2, config.shadow, 1)

        // each one is added to `options` as it's made, which is what gives it its index
        if (this.endSceneType === "pause") this.addOption("Continue", () => {
            this.onContinue?.()
        })
        this.addOption(outcome.retry, () => this.onRetry())
        if (this.launchData.run) this.addOption("Leaderboard", () => this.openLeaderboard())
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
        
        // hide pause button, if it's not pause scene
        if(this.endSceneType !== "pause") EventBus.emit(PauseEvent.Hide)
        if(this.endSceneType === "pause") EventBus.on(PauseEvent.Resume, this.stopSceneOnResume)


        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this)
    }

    /**
     * The line under the headline. A ranked run is summed up here in place of the usual line.
     *
     * @param fallback - the outcome's usual subtitle
     * @returns the wave and kill count of a ranked run, or `fallback` without one
     */
    private subtitleText(fallback: string): string {
        const run = this.launchData.run
        if (!run) return fallback

        return `Fell on wave ${run.wave} with ${run.kills} ${run.kills === 1 ? "kill" : "kills"}`
    }

    /**
     * Open the leaderboard in this screen's place. Leaving it brings this screen back just
     * as it was, from {@link launchData}.
     *
     * The way back goes through the scene manager rather than this scene's plugin, which
     * won't launch its own key.
     */
    private openLeaderboard(): void {
        const data = this.launchData

        this.scene.launch("LeaderboardScene", {
            run: data.run,
            onBack: () => this.scene.manager.start("EndScene", data),
        } satisfies LeaderboardSceneData)
    }

    /**
     * Add a choice below the ones already made. Hovering selects it and releasing the
     * pointer picks it; the action is also kept on the text for the keyboard to find.
     *
     * @param label - the text the option shows
     * @param choose - what picking the option does
     * @returns the option's text object
     */
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

    /**
     * Arrows or W/S to move between the options, wrapping round at either end, and
     * Enter or Space to take one. With nothing selected yet, the first move lands on
     * the top option, and confirming takes it.
     */
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

    /**
     * Highlight one option and put the rest back to normal. Clicks only once the screen
     * is fully up, so the fade-in stays quiet.
     *
     * @param index - the option to highlight, -1 for none
     */
    private select(index: number): void {
        if (index === this.selected) return
        this.selected = index

        this.options.forEach((option, i) => {
            option.setTint(i === index ? this.config.optionHoverTint : this.config.optionTint)
        })

        if (index >= 0 && this.ready) AudioController.instance.play("ui-click")
    }

    /**
     * Take a choice. Ignored until the screen is fully up, and after the first pick -
     * the screen closes itself before running the choice.
     *
     * @param choose - the option's action
     */
    private choose(choose: () => void): void {
        if (!this.ready || this.chosen) return
        this.chosen = true
        
        // EventBus.emit(PauseEvent.Resume)
        AudioController.instance.play("ui-confirm")

        // out of the way first - what the choice does may well restart the scene under it
        this.scene.stop()
        choose()
    }

    shutdown(){
        EventBus.off(PauseEvent.Resume, this.stopSceneOnResume)
    }
}
