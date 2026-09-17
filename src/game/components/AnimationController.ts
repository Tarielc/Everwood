import * as Phaser from 'phaser';
import { AnimConfig } from '../data/animations';

// set of animations - entries are optional, so a sheet can leave out the ones it
// hasn't got the frames for and callers ask with has() before playing them
export type AnimSet = Record<string, AnimConfig | undefined>

// facing left | skip | facing right
export type Facing = -1 | 0 | 1

// texture and facing direction
export interface AnimationControllerOptions {
    texture?: string
    facing?: 'left' | 'right'
}

// options for animations
export interface PlayOptions {
    // animations might have higher priority
    priority?: number
    // you can lock animations, so it can only be interrupted by higher priority animation
    lock?: boolean
    // restart animation
    restart?: boolean
    // forces animation to play, despite lock and priority
    force?: boolean
    onComplete?: () => void
}

export class AnimationController<TAnims extends AnimSet = AnimSet> {
    // current animation
    private current: keyof TAnims | null = null

    // current facing direction - where player must be looking right now
    private currentFacing: Exclude<Facing, 0>
    // current facing direction in game - where player is looking right now
    private drawnFacing: Exclude<Facing, 0>

    // priority of the locked animation
    private lockedPriority: number | null = null

    //listen for animation completion
    private completeKey: string | null = null
    private completeHandler: (() => void) | null = null

    constructor(
        private sprite: Phaser.GameObjects.Sprite,
        private anims: TAnims,
        options: AnimationControllerOptions = {}
    ) {
        this.drawnFacing = options.facing === 'right' ? 1 : -1
        this.currentFacing = this.drawnFacing

        this.register(options.texture ?? sprite.texture.key)
        this.applyFacing()
    }

    // set facing direction
    setFacing(direction: Facing): void {
        if (direction === 0 || direction === this.currentFacing) return

        this.currentFacing = direction
        this.applyFacing()
    }

    // play specified animation
    play(name: keyof TAnims, options: PlayOptions = {}): boolean {
        // get configuration of the specified animation
        const config = this.anims[name]
        if (!config) {
            console.warn(`Animation ${String(name)} doesn't exists`)
            return false
        }

        // get extra options
        const { restart = false, force = false, onComplete } = options
        const priority = options.priority ?? config.priority ?? 0

        // if animation isn't forced and it's priority is the lower then locked animation, don't play it, return false, 
        if (!force && this.lockedPriority !== null && priority <= this.lockedPriority) return false

        // if specified animation is already playing, nothing to do, return true
        if (!restart && this.current === name && this.sprite.anims.isPlaying) return true

        // reset animation trackers
        this.clearCompleteListener()
        this.lockedPriority = null
        this.current = name

        // does animation has locked option?
        const lock = options.lock ?? config.lockUntilComplete ?? false

        // only save locked priority, if animation config.repeat doesn't make animations play continously
        if (lock && config.repeat < 0) {
            console.warn(`Animation ${config.key} loops forever and can't be locked`)
        } else if (lock) {
            this.lockedPriority = priority
        }

        // if animation is locked, add listener for it's completion
        if (onComplete || this.lockedPriority !== null) {
            this.listenForComplete(config.key, onComplete)
        }
        
        // play specified animation and return true
        this.sprite.anims.play(config.key, !restart)
        return true
    }

    // release priority
    release(): void {
        this.lockedPriority = null
        this.clearCompleteListener()
    }

    // stop animation playing
    stop(): void {
        this.release()
        this.current = null
        this.sprite.anims.stop()
    }

    // does this set actually have the animation? optional entries mean a caller
    // can pick a fallback instead of playing a warning
    has(name: keyof TAnims): boolean {
        return Boolean(this.anims[name])
    }

    // check if the specific animation is playing
    isPlaying(name: keyof TAnims): boolean {
        return this.current === name && this.sprite.anims.isPlaying
    }

    get playing(): keyof TAnims | null {
        return this.current
    }

    get isLocked(): boolean {
        return this.lockedPriority !== null
    }

    get facing(): Exclude<Facing, 0> {
        return this.currentFacing
    }

    // apply setFlipX bases on facing directions
    private applyFacing(): void {
        this.sprite.setFlipX(this.currentFacing !== this.drawnFacing)
    }

    destroy(): void {
        this.clearCompleteListener()
        this.current = null
        this.lockedPriority = null
    }

    // register animations in global AnimationController
    private register(texture: string): void {
        const manager = this.sprite.scene.anims

        for (const config of Object.values(this.anims) as (AnimConfig | undefined)[]) {
            if (!config || manager.exists(config.key)) continue

            manager.create({
                key: config.key,
                frames: manager.generateFrameNumbers(texture, { start: config.start, end: config.end }),
                frameRate: config.frameRate,
                repeat: config.repeat,
                yoyo: config.yoyo ?? false,
            })
        }
    }

    // listen if animation is complete and add one-time listener to sprite
    private listenForComplete(key: string, onComplete?: () => void): void {
        this.completeKey = Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + key
        this.completeHandler = () => {
            this.completeKey = null
            this.completeHandler = null
            this.lockedPriority = null
            onComplete?.()
        }

        this.sprite.once(this.completeKey, this.completeHandler)
    }

    // clear animation complete listener
    private clearCompleteListener(): void {
        if (this.completeKey && this.completeHandler) {
            this.sprite.off(this.completeKey, this.completeHandler)
        }
        this.completeKey = null
        this.completeHandler = null
    }
}
