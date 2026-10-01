import * as Phaser from 'phaser';
import { LEADERBOARD_SCREEN, LeaderboardScreenConfig } from '../config/ui';
import { LEADERBOARD_SIZE, LeaderboardEntry, cleanName, NAME_MAX_LENGTH } from '../data/leaderboard';
import { LeaderboardClient } from '../systems/leaderboard/LeaderboardClient';
import { AudioController } from '../systems/audio/AudioController';
import { NameEntry } from '../ui/NameEntry';
import { onResize, safeArea } from '../utils/viewport';

/** The arena run the board is being looked at from */
export interface ArenaRun {
    /** The wave it ended on, counting from 1 */
    wave: number,
    /** Wave foes that went down on the way there */
    kills: number,
    /**
     * Where it landed once it has been submitted, and the name it went in under. Set on
     * the run itself, so going back to the death screen and in here again doesn't offer
     * to submit it a second time
     */
    rank?: number,
    name?: string,
}

export interface LeaderboardSceneData {
    /** The run just played - without one the board is only shown, not signed */
    run?: ArenaRun,
    /** Leave the board - what that goes back to is up to whoever opened it */
    onBack: () => void,
}

/** What's standing where the board's rows go */
type BoardState =
    | { kind: "loading" }
    | { kind: "error", message: string }
    | { kind: "ready", entries: LeaderboardEntry[] }

/**
 * The arena leaderboard - the top of the board, and a form to put the run just played on it.
 *
 * Drawn over the paused level like the end screen it's opened from. The rows are
 * bitmap text like the rest of the game's menus; the name box is real HTML
 * ({@link NameEntry}) laid into a gap left for it, because only a real input can raise
 * a phone's keyboard.
 */
export default class LeaderboardScene extends Phaser.Scene {
    private run?: ArenaRun
    private onBack: () => void = () => {}

    private board: BoardState = { kind: "loading" }

    /** Everything drawn in Phaser, laid out at design size and scaled as one to fit */
    private content!: Phaser.GameObjects.Container
    private subtitle!: Phaser.GameObjects.BitmapText
    private rows!: Phaser.GameObjects.Container
    private back!: Phaser.GameObjects.BitmapText

    /** Up until the run is on the board */
    private nameEntry: NameEntry | null = null

    /** Bumped on every start, so a request that lands after the scene has moved on is dropped */
    private generation: number = 0

    /** Nothing is picked until the screen is fully up, so a key mashed on the way in doesn't close it */
    private ready: boolean = false
    /** The first pick wins - the scene is on its way out after it */
    private leaving: boolean = false

    /** Re-run whenever the board or the form changes what's on screen */
    private relayout: () => void = () => {}

    constructor(private readonly config: LeaderboardScreenConfig = LEADERBOARD_SCREEN) {
        super("LeaderboardScene")
    }

    // a relaunched scene is the same instance, so every visit starts from scratch
    init(data: LeaderboardSceneData) {
        this.run = data.run
        this.onBack = data.onBack
        this.board = { kind: "loading" }
        this.nameEntry = null
        this.ready = false
        this.leaving = false
        this.generation += 1
    }

    create() {
        const config = this.config

        const backdrop = this.add.rectangle(0, 0, 1, 1, config.backdropColour, config.backdropAlpha)
            .setOrigin(0)
            // swallows clicks, so nothing underneath can be pressed through it
            .setInteractive()

        const title = this.text(config.titleFont, "Leaderboard", config.titleSize, config.titleTint, 3)
        this.subtitle = this.text(config.textFont, "", config.subtitleSize, config.textTint)
        this.rows = this.add.container()

        this.back = this.text(config.textFont, "Back", config.optionSize, config.optionTint)
            .setInteractive({ useHandCursor: true })
        this.back.on("pointerover", () => this.hoverBack(true))
        this.back.on("pointerout", () => this.hoverBack(false))
        // pointerup rather than pointerdown, the same as the end screen's options
        this.back.on("pointerup", () => this.leave())

        this.content = this.add.container(0, 0, [title, this.subtitle, this.rows, this.back])

        if (this.run && this.run.rank === undefined) {
            this.nameEntry = new NameEntry(this, LeaderboardClient.lastName(), name => this.submit(name))
        }

        // filled in before the first layout, which measures them
        this.refreshSubtitle()
        this.renderBoard()

        this.relayout = () => this.layout(this.scale.width, this.scale.height, title)
        onResize(this, (width, height) => {
            backdrop.setSize(width, height)
            this.layout(width, height, title)
        })

        backdrop.setAlpha(0)
        this.content.setAlpha(0)
        this.tweens.add({
            targets: [backdrop, this.content],
            alpha: 1,
            duration: config.fadeInMs,
            ease: "Sine.easeOut",
            onComplete: () => { this.ready = true },
        })

        this.bindKeys()
        this.fetchBoard()
    }

    /** A line of centred, shadowed bitmap text - everything on this screen is one */
    private text(font: string, label: string, size: number, tint: number, shadow = 2): Phaser.GameObjects.BitmapText {
        return this.add.bitmapText(0, 0, font, label, size)
            .setOrigin(0.5, 0)
            .setTint(tint)
            .setDropShadow(shadow, shadow, this.config.shadow, 1)
    }

    /**
     * Stack the screen top to bottom at design size, then scale the lot down if the view
     * is too small for it - a phone in landscape is barely taller than the board alone
     */
    private layout(width: number, height: number, title: Phaser.GameObjects.BitmapText): void {
        const config = this.config
        const inset = safeArea(this.scale)

        let y = 0
        title.setPosition(0, y)
        y += title.height + config.gap / 2

        this.subtitle.setPosition(0, y)
        y += this.subtitle.height + config.gap

        this.rows.setPosition(-config.boardWidth / 2, y)
        y += this.boardHeight() + config.gap

        const formY = y
        if (this.nameEntry) y += config.formHeight + config.gap

        this.back.setPosition(0, y)
        y += this.back.height

        const availableWidth = width - inset.left - inset.right - config.margin * 2
        const availableHeight = height - inset.top - inset.bottom - config.margin * 2
        // the widest thing on screen - usually the board, but a long run line can outgrow it
        const contentWidth = Math.max(config.boardWidth, title.width, this.subtitle.width)
        const scale = Math.min(1, availableWidth / contentWidth, availableHeight / y)

        const centerX = inset.left + (width - inset.left - inset.right) / 2
        const top = inset.top + (height - inset.top - inset.bottom - y * scale) / 2

        this.content.setScale(scale).setPosition(centerX, top)

        this.nameEntry?.place(
            centerX - config.boardWidth / 2 * scale,
            top + formY * scale,
            config.boardWidth * scale,
            config.formHeight * scale,
        )
    }

    /** Room the rows take - the same whether they're loaded yet or not, so nothing jumps when they land */
    private boardHeight(): number {
        const { rowSize, rowGap } = this.config
        // the heading row, then a full board
        return (LEADERBOARD_SIZE + 1) * (rowSize + rowGap) - rowGap
    }

    /** "Wave 7 · kills 43 ", and where it placed once it has */
    private refreshSubtitle(): void {
        const run = this.run
        if (!run) {
            this.subtitle.setText("The deepest runs through the arena")
            return
        }

        const kills = `${run.kills === 1 ? "kill" : "kills"} ${run.kills}`
        const placed = run.rank === undefined ? "" : `  -  #${run.rank}`
        this.subtitle.setText(`Your run: Wave ${run.wave}, ${kills}${placed}`)
    }

    /** Draw whatever the board currently holds into the rows container */
    private renderBoard(): void {
        const config = this.config
        this.rows.removeAll(true)

        const cell = (label: string, x: number, y: number, tint: number) => {
            const text = this.add.bitmapText(x, y, config.textFont, label, config.rowSize)
                .setTint(tint)
                .setDropShadow(2, 2, config.shadow, 1)
            this.rows.add(text)
        }

        const { columns } = config
        const step = config.rowSize + config.rowGap

        cell("#", columns.rank, 0, config.mutedTint)
        cell("Name", columns.name, 0, config.mutedTint)
        cell("Wave", columns.wave, 0, config.mutedTint)
        cell("Kills", columns.kills, 0, config.mutedTint)

        const message = (label: string) => {
            const text = this.add.bitmapText(config.boardWidth / 2, step * 2, config.textFont, label, config.rowSize)
                .setOrigin(0.5, 0)
                .setTint(config.mutedTint)
            this.rows.add(text)
        }

        if (this.board.kind === "loading") return message("Loading...")
        if (this.board.kind === "error") return message(this.board.message)
        if (this.board.entries.length === 0) return message("No runs yet - be the first")

        const own = this.ownRow(this.board.entries)

        this.board.entries.forEach((entry, index) => {
            const y = step * (index + 1)
            const tint = index === own ? config.highlightTint : config.textTint

            cell(`${index + 1}`, columns.rank, y, tint)
            cell(entry.name, columns.name, y, tint)
            cell(`${entry.wave}`, columns.wave, y, tint)
            cell(`${entry.kills}`, columns.kills, y, tint)
        })
    }

    /**
     * Which row is the run just submitted, or -1. A tie shares its rank but is listed
     * oldest first, so the newest run is the last row that matches it
     */
    private ownRow(entries: LeaderboardEntry[]): number {
        const run = this.run
        if (!run || run.name === undefined) return -1

        for (let i = entries.length - 1; i >= 0; i--) {
            const entry = entries[i]
            if (entry.name === run.name && entry.wave === run.wave && entry.kills === run.kills) return i
        }
        return -1
    }

    /** Fetch the top of the board and put it up - or say why it can't be */
    private async fetchBoard(): Promise<void> {
        const generation = this.generation
        this.board = { kind: "loading" }
        this.renderBoard()

        try {
            const entries = await LeaderboardClient.top()
            if (generation !== this.generation) return
            this.board = { kind: "ready", entries }
        } catch (error) {
            if (generation !== this.generation) return
            this.board = { kind: "error", message: (error as Error).message }
        }

        this.renderBoard()
    }

    /** Sign the run with a name and send it - the board reloads once it's in */
    private async submit(typed: string): Promise<void> {
        const run = this.run
        const form = this.nameEntry
        if (!run || !form || run.rank !== undefined) return

        const name = cleanName(typed)
        if (!name) {
            form.showError(`1-${NAME_MAX_LENGTH} letters, digits, spaces or . _ ' -`)
            return
        }

        const generation = this.generation
        form.showError("")
        form.setBusy(true)

        try {
            const rank = await LeaderboardClient.submit({ name, wave: run.wave, kills: run.kills })
            if (generation !== this.generation) return

            run.rank = rank
            run.name = name
            AudioController.instance.play("ui-confirm")

            // the form's job is done - the gap it held closes up
            form.destroy()
            this.nameEntry = null
            this.refreshSubtitle()
            this.relayout()
            this.fetchBoard()
        } catch (error) {
            if (generation !== this.generation) return
            form.setBusy(false)
            form.showError((error as Error).message)
        }
    }

    private hoverBack(on: boolean): void {
        this.back.setTint(on ? this.config.optionHoverTint : this.config.optionTint)
        if (on) AudioController.instance.play("ui-click")
    }

    // enter, space or escape to go back - typing in the name box never reaches these,
    // the form keeps its keys to itself
    private bindKeys(): void {
        const keyboard = this.input.keyboard
        if (!keyboard) return

        keyboard.on("keydown-ENTER", () => this.leave())
        keyboard.on("keydown-SPACE", () => this.leave())
        keyboard.on("keydown-ESC", () => this.leave())
    }

    private leave(): void {
        if (!this.ready || this.leaving) return
        this.leaving = true

        AudioController.instance.play("ui-confirm")

        // any request still in flight is dropped when it lands
        this.generation += 1
        this.scene.stop()
        this.onBack()
    }
}
