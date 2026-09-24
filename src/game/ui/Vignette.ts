import * as Phaser from 'phaser';
import { VignetteConfig, VignetteFlash } from '../config/ui';
import { onResize } from '../utils/viewport';

/**
 * A full-screen gradient, clear in the middle and coloured towards the edges.
 *
 * It has two independent drivers, and whichever is stronger wins each frame:
 * - {@link setStrength} - a held level it eases towards, for ongoing states (low health)
 * - {@link flash} - a one-off swell and ebb, for moments (a heal)
 *
 * Its owner must call {@link update} every frame. One instance per colour, so two
 * effects can overlap - a heal's green rising while low health's red fades out.
 */
export class Vignette {
    private readonly image: Phaser.GameObjects.Image

    // the held level asked for, 0..1
    private target: number = 0
    // the held level on screen - eases towards target so it never pops in or out
    private strength: number = 0
    // the one-off level, driven by the flash tween, 0..1
    private readonly flashLevel = { value: 0 }
    private flashTween?: Phaser.Tweens.TweenChain

    /**
     * @param key - Texture key for this look's gradient, drawn once and cached on the game
     */
    constructor(
        private readonly scene: Phaser.Scene,
        key: string,
        private readonly config: VignetteConfig,
    ) {
        if (!scene.textures.exists(key)) Vignette.drawTexture(scene, key, config)

        this.image = scene.add.image(0, 0, key)
            .setOrigin(0)
            .setScrollFactor(0)
            .setDepth(config.depth)
            .setAlpha(0)
            .setVisible(false)

        // stretched, so it hugs every edge whatever the aspect ratio
        onResize(scene, (width, height) => this.image.setDisplaySize(width, height))
    }

    /** Hold at a level, 0..1 - eased towards over `fadeMs` */
    setStrength(strength: number): void {
        this.target = Phaser.Math.Clamp(strength, 0, 1)
    }

    /** Swell in, hold, and ebb away once - restarts if already playing */
    flash({ inMs, holdMs, outMs }: VignetteFlash): void {
        this.flashTween?.stop()
        this.flashLevel.value = 0

        this.flashTween = this.scene.tweens.chain({
            targets: this.flashLevel,
            tweens: [
                { value: 1, duration: inMs, ease: "Quad.easeOut" },
                { value: 0, delay: holdMs, duration: outMs, ease: "Sine.easeIn" },
            ],
        })
    }

    update(time: number, delta: number): void {
        this.strength = this.approach(this.strength, this.target, delta)

        const level = Math.max(this.strength * this.pulse(time), this.flashLevel.value)
        this.image
            .setVisible(level > 0)
            .setAlpha(level * this.config.maxAlpha)
    }

    destroy(): void {
        this.flashTween?.stop()
        this.flashTween = undefined
        this.image.destroy()
    }

    // step `from` towards `to` at a rate that covers the full 0..1 range in fadeMs
    private approach(from: number, to: number, delta: number): number {
        const { fadeMs } = this.config
        if (fadeMs <= 0) return to

        const step = delta / fadeMs
        return from < to ? Math.min(to, from + step) : Math.max(to, from - step)
    }

    // 1 when there's no pulse, otherwise a heartbeat dipping to 1 - pulse.depth
    private pulse(time: number): number {
        const { pulse } = this.config
        if (!pulse) return 1

        // squared, so it reads as a beat rather than a lazy wave
        const wave = (Math.sin((time / pulse.periodMs) * Math.PI * 2) + 1) / 2
        return 1 - pulse.depth * (1 - wave * wave)
    }

    private static drawTexture(scene: Phaser.Scene, key: string, config: VignetteConfig): void {
        const { edge, corner, inner, textureSize: size } = config
        const texture = scene.textures.createCanvas(key, size, size)
        if (!texture) return

        const ctx = texture.getContext()
        const half = size / 2

        // clear middle, edge colour towards the sides, corner colour at the very corners
        const gradient = ctx.createRadialGradient(half, half, half * inner, half, half, half * Math.SQRT2)
        gradient.addColorStop(0, cssColor(edge, 0))
        gradient.addColorStop(0.45, cssColor(edge, 1))
        gradient.addColorStop(1, cssColor(corner, 1))

        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, size, size)
        texture.refresh()

        // the game renders pixel art with nearest filtering - a stretched gradient would band
        texture.setFilter(Phaser.Textures.FilterMode.LINEAR)
    }
}

// 0xRRGGBB and an alpha into a canvas colour string
function cssColor(color: number, alpha: number): string {
    const { r, g, b } = Phaser.Display.Color.IntegerToRGB(color)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
