import * as Phaser from 'phaser';

import { IMPACT_FREEZE_MAX_MS, ImpactProfile } from '../../config/feel';

/**
 * What a landed blow does to the world around it - the hitstop and the camera shake.
 *
 * One per scene, owned by it. Everything that lands a hit only says that it landed
 * and how big it was; how long the world holds still and how hard the screen moves is
 * decided here, from the {@link ImpactProfile} it was handed.
 *
 * **Hitstop** freezes the world rather than slowing it: the arcade world stops stepping
 * and every animation stops advancing, so a swing holds on exactly the frame it
 * connected on. The scene skips its own update alongside it - see {@link update} - which
 * is what also freezes cooldowns, attack timers and the input sampling, so a press made
 * during the freeze is still a fresh press once it lifts rather than a swallowed one.
 *
 * **Shake** is the camera's own effect, which runs on the scene's step rather than the
 * physics one - so it rings out *while* the world is held still, which is the whole
 * trick. The stronger shake always wins, so a fox biting mid-swing can't cut short the
 * jolt of the blow that killed it.
 *
 * Requests stack by taking the longest and the hardest, never by adding up: a crowd all
 * connecting on one frame is a single impact, not a stutter.
 *
 * @example
 * ```ts
 * // Scene.create()
 * this.impact = new ImpactController(this)
 *
 * // wherever a blow lands
 * this.impact.hit(IMPACT.foeHit, impactScale(change.amount, change.max))
 *
 * // Scene.update(), before anything else
 * if (this.impact.update(delta)) return
 * ```
 */
export class ImpactController {

    /** Milliseconds of hitstop still owed - `0` whenever the world is running */
    private remainingMs: number = 0

    /** Whether the world is currently held, so a thaw can't resume something it never paused */
    private frozen: boolean = false

    /** Animation speed to put back on thaw, read at the moment of the freeze rather than assumed */
    private animTimeScale: number = 1

    /**
     * Creates a controller for one scene and registers cleanup on its shutdown.
     *
     * @param scene - Scene whose physics, animations and main camera are held and shaken
     */
    constructor(private readonly scene: Phaser.Scene) {
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this)
    }

    /**
     * Land a blow - freezes the world and shakes the camera, both as the profile has them.
     *
     * @param profile - What this kind of impact is worth, from `IMPACT`
     * @param scale - How big this particular hit was, from `impactScale()`. `1` plays the profile as authored
     */
    hit(profile: ImpactProfile, scale: number = 1): void {
        this.freeze(profile.freezeMs * scale)
        this.shake(profile.shakeIntensity * scale, profile.shakeMs)
    }

    /**
     * Hold the world still.
     *
     * The longest outstanding request wins, capped at {@link IMPACT_FREEZE_MAX_MS} -
     * a freeze already running is never extended past it by the hits landing inside it.
     *
     * @param ms - How long to hold for. Anything at or below `0` does nothing
     */
    freeze(ms: number): void {
        if (ms <= 0) return

        const held = Math.min(Math.max(this.remainingMs, ms), IMPACT_FREEZE_MAX_MS)

        if (!this.frozen) this.hold()
        this.remainingMs = held
    }

    /**
     * Shake the main camera.
     *
     * A weaker shake never interrupts a stronger one that is still running; anything
     * at least as hard restarts it, so repeated blows keep the screen alive rather
     * than letting the first one ring out alone.
     *
     * @param intensity - Fraction of the viewport to shake by - small floats
     * @param durationMs - How long the shake runs
     */
    shake(intensity: number, durationMs: number): void {
        if (intensity <= 0 || durationMs <= 0) return

        const camera = this.scene.cameras.main
        if (!camera) return

        const running = camera.shakeEffect
        if (running.isRunning && running.intensity.x > intensity) return

        // forced, because the effect refuses to restart itself while it is running,
        // and the check above has already decided this one is worth hearing over it
        camera.shake(durationMs, intensity, true)
    }

    /**
     * Tick the hitstop. Call first in the scene's `update()`, and skip the rest of
     * the frame while it says to - nothing that moves the world should run during a freeze.
     *
     * The frame a freeze runs out on is played normally rather than skipped, so the
     * world picks up on the same frame it thawed.
     *
     * @param delta - Time elapsed since the previous frame
     * @returns `true` while the world should hold still, `false` once it is running again
     */
    update(delta: number): boolean {
        if (this.remainingMs <= 0) return false

        this.remainingMs -= delta
        if (this.remainingMs > 0) return true

        this.thaw()
        return false
    }

    /** `true` while a hit is holding the world still */
    get isFrozen(): boolean {
        return this.frozen
    }

    /**
     * Puts the world back the way it was found.
     *
     * Called on scene shutdown, so a level change landing mid-freeze can't leave the
     * next one paused - animation speed especially, which is the game's rather than
     * this scene's and would outlive the restart.
     */
    destroy(): void {
        this.thaw()
    }

    /** Stop the world: physics stops stepping and every animation stops advancing */
    private hold(): void {
        this.frozen = true

        this.animTimeScale = this.scene.anims.globalTimeScale
        this.scene.anims.globalTimeScale = 0
        this.scene.physics.world.pause()
    }

    /** Start it again. Safe to call on a world that was never held */
    private thaw(): void {
        this.remainingMs = 0
        if (!this.frozen) return

        this.frozen = false

        this.scene.anims.globalTimeScale = this.animTimeScale
        this.scene.physics.world.resume()
    }
}
