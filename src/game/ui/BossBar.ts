import * as Phaser from 'phaser';

import { BOSS_BAR, BossBarConfig } from '../config/ui';
import { HealthChange, HealthComponent, HealthEvent, HealthEventName } from '../components/HealthComponent';
import { onResize, safeArea } from '../utils/viewport';

/**
 * A boss's name and health, in a wide bar along the bottom of the screen.
 *
 * Hits take the fill down straight away and leave a pale chip behind it, which holds
 * for a beat and then drains - so the player sees how much a combo took as one chunk.
 *
 * Like {@link WaveCounter} it's a plain game object rather than a scene - it belongs
 * to the level being fought and leaves with it on a level change. It listens to the
 * boss's own {@link HealthComponent} rather than the EventBus, since a foe's health
 * isn't mirrored onto the bus and any number of foes could be alive at once.
 */
export class BossBar {
    /** Everything the bar is made of, faded in and out as one */
    private readonly container: Phaser.GameObjects.Container
    /** The rim, the track, the chip and the fill - redrawn whenever one of them moves */
    private readonly bar: Phaser.GameObjects.Graphics
    /** The boss's name, sat over the left end of the bar */
    private readonly title: Phaser.GameObjects.BitmapText

    /** Width the bar is drawn at, after fitting it to the view */
    private width: number = 0
    /** Health as drawn, 0..1 - slides to the real value */
    private fill: number = 1
    /** Where the chip ends, 0..1 - never below `fill` */
    private chip: number = 1
    /** Whether the fill is showing its hit flash */
    private flashing: boolean = false

    /** The health being followed, null while the bar is idle */
    private health: HealthComponent | null = null
    /** Every listener put on `health`, so letting it go can take them all back off */
    private listeners: Array<{ event: HealthEventName, handler: (change: HealthChange) => void }> = []

    private fillTween?: Phaser.Tweens.Tween
    private chipTween?: Phaser.Tweens.Tween
    private fadeTween?: Phaser.Tweens.Tween
    private flashTimer?: Phaser.Time.TimerEvent

    /**
     * @param scene - Scene to draw the bar over
     * @param config - Look, placement and timing
     */
    constructor(
        private readonly scene: Phaser.Scene,
        private readonly config: BossBarConfig = BOSS_BAR,
    ) {
        this.bar = scene.add.graphics()
        this.title = scene.add.bitmapText(0, -config.border - config.titleGap, config.font, "", config.titleSize)
            .setOrigin(0, 1)
            .setTint(config.titleTint)
            .setDropShadow(2, 2, config.titleShadow, 1)

        this.container = scene.add.container(0, 0, [this.bar, this.title])
            // pinned to the camera - the world scrolls underneath it
            .setScrollFactor(0, 0, true)
            .setDepth(config.depth)
            .setAlpha(0)
            .setVisible(false)

        // centred along the bottom of the live view, narrowed to fit it, and kept
        // clear of whatever a phone's notch or home bar is covering
        onResize(scene, (width, height) => {
            const inset = safeArea(scene.scale)
            const room = width - inset.left - inset.right - config.margin * 2

            this.width = Math.max(0, Math.min(config.width, room))
            this.container.setPosition(
                Math.round(inset.left + (width - inset.left - inset.right - this.width) / 2),
                Math.round(height - inset.bottom - config.margin - config.height),
            )
            this.redraw()
        })

        // the boss's component can outlive this scene's display list by a frame -
        // don't leave it calling into destroyed objects
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.release, this)
    }

    /**
     * Show a boss's bar and follow its health until it dies. A boss already being
     * followed is let go in favour of this one
     *
     * @param health - The boss's health
     * @param title - Name printed over the bar
     */
    track(health: HealthComponent, title: string): void {
        this.release()

        this.health = health
        this.title.setText(title)

        // drawn at its current value, so a wounded boss doesn't appear full first
        this.fill = this.chip = health.ratio
        this.flashing = false
        this.redraw()

        this.listen(HealthEvent.Changed, change => this.onChanged(change))
        this.listen(HealthEvent.Damaged, () => this.flash())
        this.listen(HealthEvent.Died, () => this.onDied())

        this.fadeTo(1, this.config.fadeInMs)
    }

    /** Destructor and cleanup */
    destroy(): void {
        this.release()
        this.fadeTween?.stop()
        this.container.destroy()
    }

    // the fill follows quickly; a drop leaves the chip behind to drain on its own
    // timer, while a heal pulls the chip straight up with it
    private onChanged(change: HealthChange): void {
        const target = Phaser.Math.Clamp(change.ratio, 0, 1)

        this.fillTween?.stop()
        const fill = { value: this.fill }
        this.fillTween = this.scene.tweens.add({
            targets: fill,
            value: target,
            duration: this.config.tweenMs,
            ease: "Quad.easeOut",
            onUpdate: () => {
                this.fill = fill.value
                this.chip = Math.max(this.chip, this.fill)
                this.redraw()
            },
        })

        if (target >= this.chip) {
            this.chipTween?.stop()
            return
        }

        // restarted on every hit, so the wait only runs out once the combo does
        this.chipTween?.stop()
        const chip = { value: this.chip }
        this.chipTween = this.scene.tweens.add({
            targets: chip,
            value: target,
            delay: this.config.chipDelayMs,
            duration: this.config.chipMs,
            ease: "Sine.easeIn",
            onUpdate: () => {
                this.chip = Math.max(chip.value, this.fill)
                this.redraw()
            },
        })
    }

    // left up long enough to watch it empty, then faded out and let go
    private onDied(): void {
        this.fadeTo(0, this.config.fadeOutMs, this.config.fadeOutDelayMs, () => this.release())
    }

    // a quick white pulse over the fill whenever a hit lands
    private flash(): void {
        this.flashTimer?.remove()
        this.flashing = true
        this.redraw()

        this.flashTimer = this.scene.time.delayedCall(this.config.damageFlashMs, () => {
            this.flashing = false
            this.redraw()
        })
    }

    private fadeTo(alpha: number, duration: number, delay: number = 0, onComplete?: () => void): void {
        this.fadeTween?.stop()
        this.container.setVisible(true)

        this.fadeTween = this.scene.tweens.add({
            targets: this.container,
            alpha,
            delay,
            duration,
            onComplete: () => {
                if (alpha === 0) this.container.setVisible(false)
                onComplete?.()
            },
        })
    }

    private redraw(): void {
        const { border, height } = this.config
        const width = this.width

        this.bar.clear()

        this.bar.fillStyle(this.config.frameColour)
        this.bar.fillRect(-border, -border, width + border * 2, height + border * 2)

        this.bar.fillStyle(this.config.trackColour)
        this.bar.fillRect(0, 0, width, height)

        this.bar.fillStyle(this.config.chipColour)
        this.bar.fillRect(0, 0, Math.round(width * this.chip), height)

        this.bar.fillStyle(this.flashing ? this.config.damageFlash : this.config.fillColour)
        this.bar.fillRect(0, 0, Math.round(width * this.fill), height)
    }

    private listen(event: HealthEventName, handler: (change: HealthChange) => void): void {
        this.health?.on(event, handler)
        this.listeners.push({ event, handler })
    }

    // stop following the current boss - the bar keeps whatever it last drew
    private release(): void {
        for (const { event, handler } of this.listeners) {
            this.health?.off(event, handler)
        }
        this.listeners.length = 0
        this.health = null

        this.fillTween?.stop()
        this.chipTween?.stop()
        this.flashTimer?.remove()
        this.fillTween = this.chipTween = this.flashTimer = undefined
    }
}
