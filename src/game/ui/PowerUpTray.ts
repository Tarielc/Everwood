import * as Phaser from 'phaser';

import { HEALTH_BAR, POWER_UP_TRAY, PowerUpTrayConfig } from '../config/ui';
import { POWER_UPS, PowerUpId } from '../data/powerUps';
import { ATLAS, UI_FRAMES } from '../config/atlas';
import { StatusEffect, StatusEffectComponent, StatusEffectEvent } from '../components/StatusEffectComponent';
import { hudScale, onResize, safeArea } from '../utils/viewport';

/** One running power up as the tray draws it */
interface Slot {
    effect: StatusEffect
    icon: Phaser.GameObjects.Image
    /** the empty track, and the tinted fill that drains along it */
    track: Phaser.GameObjects.Rectangle
    fill: Phaser.GameObjects.Rectangle
}

/**
 * The row of running power ups under the health bar - an icon each, with a bar
 * underneath draining as its time runs out, and a blink over the last couple of
 * seconds.
 *
 * Like {@link WaveCounter} it's a plain game object rather than a scene. It follows
 * the player's {@link StatusEffectComponent} directly: effects are cleared on death
 * and the player is rebuilt on a level change, so there's nothing for it to carry
 * between levels the way the health bar has to.
 */
export class PowerUpTray {
    /** everything the tray draws, pinned to the camera and moved as one */
    private readonly root: Phaser.GameObjects.Container
    /** the running ones, left to right in the order they were picked up */
    private readonly slots: Slot[] = []

    /** the icons' scale for the current view, see `hudScale` */
    private iconScale: number

    /**
     * @param scene - Scene to draw the tray over
     * @param effects - Whose power ups to show - the player's
     * @param config - Size and placement
     */
    constructor(
        private readonly scene: Phaser.Scene,
        private readonly effects: StatusEffectComponent,
        private readonly config: PowerUpTrayConfig = POWER_UP_TRAY,
    ) {
        this.iconScale = config.iconScale

        this.root = scene.add.container(0, 0)
            .setScrollFactor(0)
            .setDepth(config.depth)

        // the health bar's frame, in unscaled texture pixels - the tray sits under it
        const frameHeight = scene.textures.getFrame(ATLAS, UI_FRAMES.hpBar).height

        // sized with the view and kept just under the health bar, which is scaled the
        // same way - and clear of whatever a phone's notch is covering
        onResize(scene, (width, height) => {
            const inset = safeArea(scene.scale)
            const barScale = hudScale(HEALTH_BAR.scale, width, height)
            const ratio = barScale / HEALTH_BAR.scale

            this.root.setPosition(
                config.x + inset.left,
                HEALTH_BAR.y + inset.top + frameHeight * barScale + Math.round(config.offsetY * ratio),
            )

            this.iconScale = hudScale(config.iconScale, width, height)
            this.layout()
        })

        // the component owns these listeners, and is torn down with the player
        effects.on(StatusEffectEvent.Applied, this.add, this)
        effects.on(StatusEffectEvent.Expired, this.remove, this)

        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this)
    }

    /** Runs every frame, from `GameScene.update()` - drains the bars and blinks the ones about to run out */
    update(time: number): void {
        const { warnMs, blinkMs } = this.config

        for (const slot of this.slots) {
            const { remainingMs, durationMs } = slot.effect
            const ratio = durationMs > 0 ? Phaser.Math.Clamp(remainingMs / durationMs, 0, 1) : 0
            // origin is its left edge, so scaling it drains it towards the left
            slot.fill.scaleX = ratio

            const warning = remainingMs <= warnMs
            const visible = !warning || Math.floor(time / blinkMs) % 2 === 0
            slot.icon.setAlpha(visible ? 1 : 0.35)
        }
    }

    /** A new effect - a slot at the end of the row. Anything not a power up isn't the tray's to draw */
    private add(effect: StatusEffect): void {
        if (!(effect.id in POWER_UPS)) return
        const definition = POWER_UPS[effect.id as PowerUpId]

        // sized and placed by layout()
        const icon = this.scene.add.image(0, 0, ATLAS, definition.frame).setOrigin(0)
        const track = this.scene.add.rectangle(0, 0, 1, 1, this.config.barBackground).setOrigin(0)
        const fill = this.scene.add.rectangle(0, 0, 1, 1, definition.tint).setOrigin(0)

        this.root.add([icon, track, fill])
        this.slots.push({ effect, icon, track, fill })
        this.layout()
    }

    /** An effect ran out - its slot goes, and the rest close the gap */
    private remove(effect: StatusEffect): void {
        const index = this.slots.findIndex(slot => slot.effect === effect)
        if (index < 0) return

        const [slot] = this.slots.splice(index, 1)
        slot.icon.destroy()
        slot.track.destroy()
        slot.fill.destroy()
        this.layout()
    }

    /** Size the slots for the current scale and line them up left to right */
    private layout(): void {
        // the gap and timer bar grow and shrink with the icons
        const ratio = this.iconScale / this.config.iconScale
        const iconSize = 16 * this.iconScale
        const gap = Math.round(this.config.gap * ratio)
        const barHeight = Math.max(1, Math.round(this.config.barHeight * ratio))
        const barY = iconSize + Math.max(1, Math.round(this.config.barGap * ratio))

        this.slots.forEach((slot, i) => {
            const x = i * (iconSize + gap)
            slot.icon.setScale(this.iconScale).setPosition(x, 0)
            slot.track.setSize(iconSize, barHeight).setPosition(x, barY)
            // the drain is its scaleX, set every frame in update() - only the size changes here
            slot.fill.setSize(iconSize, barHeight).setPosition(x, barY)
        })
    }

    /** Destructor and cleanup */
    destroy(): void {
        this.effects.off(StatusEffectEvent.Applied, this.add, this)
        this.effects.off(StatusEffectEvent.Expired, this.remove, this)
        this.slots.length = 0
        this.root.destroy()
    }
}
