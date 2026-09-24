import * as Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { HealthChange, HealthEvent, healthEventKey, HealthEventName, REGEN_SOURCE } from '../components/HealthComponent';
import { DAMAGE_VIGNETTE, HEAL_VIGNETTE, HEALTH_BAR, LOW_HEALTH_VIGNETTE } from '../config/ui';
import { LOW_HEALTH_RATIO } from '../config/audio';
import { PLAYER_HEALTH_BUS } from '../data/player';
import { onResize, safeArea } from '../utils/viewport';
import { Vignette } from './Vignette';

export interface HealthBarData {
    // the bar the HUD draws on its first frame, before any event arrives
    ratio?: number
    // which entity's events to follow on the global EventBus
    busPrefix?: string
}

export default class HealthBar extends Phaser.Scene {
    private healthRatio: number = 1
    private busPrefix: string = PLAYER_HEALTH_BUS

    // the orb, drained from the bottom up
    private healthFill!: Phaser.GameObjects.Image
    // stamina and mana have no components yet - they stay full until something drives them
    private staminaFill!: Phaser.GameObjects.Image
    private manaFill!: Phaser.GameObjects.Image

    private fillTween?: Phaser.Tweens.Tween

    // white copies of the frame, nudged a pixel each way behind it - together they read as an outline
    private healOutline: Phaser.GameObjects.Image[] = []
    private outlineTween?: Phaser.Tweens.Tween

    // darkens the screen edges while health is low
    private lowHealthVignette!: Vignette
    // brief red edge on a hit
    private damageVignette!: Vignette
    // green glow at the screen edges on a heal
    private healVignette!: Vignette

    // every bus key this scene subscribed to, so shutdown can take them all back off
    private subscriptions: Array<{ key: string, handler: (change: HealthChange) => void }> = []

    constructor() {
        super("HealthBar")
    }

    init({ ratio, busPrefix }: HealthBarData = {}) {
        this.healthRatio = Phaser.Math.Clamp(ratio ?? 1, 0, 1)
        this.busPrefix = busPrefix ?? PLAYER_HEALTH_BUS
    }

    create() {
        // first, so it sits under the HUD even before depth sorting
        this.lowHealthVignette = new Vignette(this, "lowHealthVignette", LOW_HEALTH_VIGNETTE)
        this.lowHealthVignette.setStrength(lowHealthStrength(this.healthRatio))
        this.damageVignette = new Vignette(this, "damageVignette", DAMAGE_VIGNETTE)
        this.healVignette = new Vignette(this, "healVignette", HEAL_VIGNETTE)

        this.healthFill = this.add.image(HEALTH_BAR.health.x, HEALTH_BAR.health.y, "healthBar").setOrigin(0)
        this.staminaFill = this.add.image(HEALTH_BAR.stamina.x, HEALTH_BAR.stamina.y, "staminaBar").setOrigin(0)
        this.manaFill = this.add.image(HEALTH_BAR.mana.x, HEALTH_BAR.mana.y, "manaBar").setOrigin(0)
        const frame = this.add.image(0, 0, "hpBar").setOrigin(0)

        const w = HEALTH_BAR.healOutlineWidth
        this.healOutline = [[-w, 0], [w, 0], [0, -w], [0, w]].map(([dx, dy]) =>
            this.add.image(dx, dy, "hpBar")
                .setOrigin(0)
                .setTint(HEALTH_BAR.healOutline)
                .setTintMode(Phaser.TintModes.FILL)
                .setAlpha(0)
        )

        const hud = this.add.container(HEALTH_BAR.x, HEALTH_BAR.y, [
            ...this.healOutline, // first, so only the rim peeks out past the frame
            this.healthFill,
            this.staminaFill,
            this.manaFill,
            frame, // Added last so it covers the fills
        ])

        hud.setScale(HEALTH_BAR.scale)
        hud.setScrollFactor(0, 0, true)
        hud.setDepth(HEALTH_BAR.depth)

        // the top-left corner doesn't move under Scale.EXPAND, but a notch can
        // sit over it in landscape - keep the HUD inside the safe area
        onResize(this, () => {
            const inset = safeArea(this.scale)
            hud.setPosition(HEALTH_BAR.x + inset.left, HEALTH_BAR.y + inset.top)
        })

        // draw the values we were handed before the first event lands
        this.drawHealth(this.healthRatio)
        this.setStamina(1)
        this.setMana(1)

        // a real heal pours in slowly so it's watched filling up - damage and regen stay snappy
        this.subscribe(HealthEvent.Changed, change => {
            const isHeal = change.amount > 0 && change.source !== REGEN_SOURCE
            this.setHealth(change.ratio, true, isHeal ? HEALTH_BAR.healTweenMs : HEALTH_BAR.tweenMs)
            this.lowHealthVignette.setStrength(lowHealthStrength(change.ratio))
        })
        this.subscribe(HealthEvent.Damaged, () => {
            this.flash()
            this.damageVignette.flash(DAMAGE_VIGNETTE.flash)
        })
        // regen ticks several times a second - only a real heal lights the outline
        this.subscribe(HealthEvent.Healed, change => {
            if (change.source === REGEN_SOURCE) return
            this.flashOutline()
            this.healVignette.flash(HEAL_VIGNETTE.flash)
        })

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.unsubscribeAll, this)
        this.events.once(Phaser.Scenes.Events.DESTROY, this.unsubscribeAll, this)
    }

    update(time: number, delta: number): void {
        this.lowHealthVignette.update(time, delta)
        this.damageVignette.update(time, delta)
        this.healVignette.update(time, delta)
    }

    // slide the orb to a new value - jumps straight there for the first draw
    setHealth(ratio: number, animate: boolean = true, durationMs: number = HEALTH_BAR.tweenMs): void {
        const target = Phaser.Math.Clamp(ratio, 0, 1)
        this.fillTween?.stop()

        if (!animate || durationMs <= 0) {
            this.healthRatio = target
            this.drawHealth(target)
            return
        }

        // tween the ratio itself rather than the image, the crop is recomputed from it
        const from = { value: this.healthRatio }
        this.fillTween = this.tweens.add({
            targets: from,
            value: target,
            duration: durationMs,
            ease: durationMs > HEALTH_BAR.tweenMs ? "Sine.easeInOut" : "Quad.easeOut",
            onUpdate: () => this.drawHealth(from.value),
            onComplete: () => { this.healthRatio = target },
        })
    }

    setStamina(ratio: number): void {
        this.cropHorizontal(this.staminaFill, ratio)
    }

    setMana(ratio: number): void {
        this.cropHorizontal(this.manaFill, ratio)
    }

    get ratio(): number {
        return this.healthRatio
    }

    // the orb is round, so it empties bottom-up like a liquid instead of sideways
    private drawHealth(ratio: number): void {
        this.healthRatio = ratio
        const { width, height } = this.healthFill

        const filled = Math.round(height * Phaser.Math.Clamp(ratio, 0, 1))
        this.healthFill.setCrop(0, height - filled, width, filled)
    }

    // the thin stamina and mana bars drain from the left edge
    private cropHorizontal(image: Phaser.GameObjects.Image, ratio: number): void {
        const { width, height } = image
        image.setCrop(0, 0, Math.round(width * Phaser.Math.Clamp(ratio, 0, 1)), height)
    }

    // a quick white pulse over the orb whenever a hit lands
    private flash(): void {
        this.healthFill.setTint(HEALTH_BAR.damageFlash).setTintMode(Phaser.TintModes.FILL)
        this.time.delayedCall(HEALTH_BAR.damageFlashMs, () => {
            this.healthFill.clearTint().setTintMode(Phaser.TintModes.MULTIPLY)
        })
    }

    // the white rim fades in and back out once when health is restored
    private flashOutline(): void {
        this.outlineTween?.stop()
        this.healOutline.forEach(image => image.setAlpha(0))

        this.outlineTween = this.tweens.add({
            targets: this.healOutline,
            alpha: 1,
            duration: HEALTH_BAR.healOutlineMs / 2,
            ease: "Quad.easeOut",
            yoyo: true,
        })
    }

    // one place to register a bus listener, so nothing can be left behind on shutdown
    private subscribe(event: HealthEventName, handler: (change: HealthChange) => void): void {
        const key = healthEventKey(this.busPrefix, event)
        EventBus.on(key, handler)
        this.subscriptions.push({ key, handler })
    }

    // the EventBus outlives this scene - a relaunch would otherwise stack duplicates
    private unsubscribeAll(): void {
        for (const { key, handler } of this.subscriptions) {
            EventBus.off(key, handler)
        }
        this.subscriptions.length = 0
        this.fillTween?.stop()
        this.fillTween = undefined
        this.outlineTween?.stop()
        this.outlineTween = undefined
    }
}

// how dark the low-health edges should be - off above the threshold and at 0 (death has
// its own presentation), noticeable the moment it's crossed, full at death's door
function lowHealthStrength(ratio: number): number {
    if (ratio <= 0 || ratio > LOW_HEALTH_RATIO) return 0
    return Phaser.Math.Linear(LOW_HEALTH_VIGNETTE.minStrength, 1, 1 - ratio / LOW_HEALTH_RATIO)
}
