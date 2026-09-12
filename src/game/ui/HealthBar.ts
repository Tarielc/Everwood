import * as Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { HealthChange, HealthEvent, healthEventKey, HealthEventName } from '../components/HealthComponent';
import { HEALTH_BAR, PLAYER_HEALTH_BUS } from '../utils/constants';
import { onResize, safeArea } from '../utils/viewport';

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
        this.healthFill = this.add.image(HEALTH_BAR.health.x, HEALTH_BAR.health.y, "healthBar").setOrigin(0)
        this.staminaFill = this.add.image(HEALTH_BAR.stamina.x, HEALTH_BAR.stamina.y, "staminaBar").setOrigin(0)
        this.manaFill = this.add.image(HEALTH_BAR.mana.x, HEALTH_BAR.mana.y, "manaBar").setOrigin(0)
        const frame = this.add.image(0, 0, "hpBar").setOrigin(0)

        const hud = this.add.container(HEALTH_BAR.x, HEALTH_BAR.y, [
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

        this.subscribe(HealthEvent.Changed, change => this.setHealth(change.ratio))
        this.subscribe(HealthEvent.Damaged, () => this.flash())

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.unsubscribeAll, this)
        this.events.once(Phaser.Scenes.Events.DESTROY, this.unsubscribeAll, this)
    }

    // slide the orb to a new value - jumps straight there for the first draw
    setHealth(ratio: number, animate: boolean = true): void {
        const target = Phaser.Math.Clamp(ratio, 0, 1)
        this.fillTween?.stop()

        if (!animate || HEALTH_BAR.tweenMs <= 0) {
            this.healthRatio = target
            this.drawHealth(target)
            return
        }

        // tween the ratio itself rather than the image, the crop is recomputed from it
        const from = { value: this.healthRatio }
        this.fillTween = this.tweens.add({
            targets: from,
            value: target,
            duration: HEALTH_BAR.tweenMs,
            ease: "Quad.easeOut",
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
    }
}
