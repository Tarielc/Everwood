import * as Phaser from 'phaser';
import { AnimConfig } from '../data/animations';

/**
 * set of animations - entries are optional so a sheet canleave out the ones it doesn't have
 * callers ask with `has()` before playing them
 */
export type AnimSet = Record<string, AnimConfig | undefined>

/** Which direction is sprite facing: left | skip | right */
export type Facing = -1 | 0 | 1

/** texture and facing direction */
export interface AnimationControllerOptions {
    texture?: string
    facing?: 'left' | 'right'
}

/** Options for animations - independent from ANIMS */
export interface PlayOptions {
    /** priority of the animation - higher-priority animations take presedence when animations conflict */
    priority?: number
    /** lovk animations so it can only be interrupted by a higher priority animation */
    lock?: boolean
    /** whether or not to restart animation */
    restart?: boolean
    /** force animation to play, despite lock and priority */
    force?: boolean
    /** callback function on animation complete */
    onComplete?: () => void
}

/**
 * AnimationController that controls and governs animations
 * 
 * Only one animation can be played at a time for an object instance.
 * 
 *  
 */
export class AnimationController<TAnims extends AnimSet = AnimSet> {
    /** current animation playing */
    private current: keyof TAnims | null = null

    /** where player must be looking right now */
    private currentFacing: Exclude<Facing, 0>

    /** where player is looking right now */
    private drawnFacing: Exclude<Facing, 0>

    /** priority of the locked animation */
    private lockedPriority: number | null = null

    /** listen for animation completion */
    private completeKey: string | null = null
    /** function to run on animation complete */
    private completeHandler: (() => void) | null = null

    /**
     * Initialize facing variables, register animations, and apply facing
     * 
     * @param sprite - sprite to animate
     * @param anims - animations list
     * @param options - extra options for animations
     */
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

    /**
     * Set sprite's facing direction
     * 
     * @param direction - where sprite should be facing
     */
    setFacing(direction: Facing): void {
        if (direction === 0 || direction === this.currentFacing) return

        this.currentFacing = direction
        this.applyFacing()
    }

    /**
     * Play specific animation.
     * 
     * @param name - animation to play.
     * @param options - extra options for animations.
     * @returns `true` if specified animation just started or was already playing, `false` otherwise.
     */
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

        // only save locked priority, if animation config.repeat doesn't make animations play continously infinitely
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

    /** release locked priority animation */
    release(): void {
        this.lockedPriority = null
        this.clearCompleteListener()
    }

    /** immediately stop animation from playing */
    stop(): void {
        this.release()
        this.current = null
        this.sprite.anims.stop()
    }

    // does this set actually have the animation? optional entries mean a caller
    // can pick a fallback instead of playing a warning
    /**
     * check whether anims this set has specified animation
     * 
     * @param name - animation to look for 
     * @returns `true` if animation found, `false` otherwise
     */
    has(name: keyof TAnims): boolean {
        return Boolean(this.anims[name])
    }

    // check if the specific animation is playing
    /**
     * Check whether specified animation playes or not
     * 
     * @param name - animation to check
     * @returns `true` if current playing animation is same as provided animation,
     *  `false` otherwise
     */
    isPlaying(name: keyof TAnims): boolean {
        return this.current === name && this.sprite.anims.isPlaying
    }


    /** Get animatio currently playing */
    get playing(): keyof TAnims | null {
        return this.current
    }

    /** Get information whether animation is locked or not */
    get isLocked(): boolean {
        return this.lockedPriority !== null
    }

    /** Get sprite's facing direction (where it must be facing) */
    get facing(): Exclude<Facing, 0> {
        return this.currentFacing
    }

    /** Apply setFlipX on sprite based on facing direction */
    private applyFacing(): void {
        this.sprite.setFlipX(this.currentFacing !== this.drawnFacing)
    }

    /** destructor and cleanup */
    destroy(): void {
        this.clearCompleteListener()
        this.current = null
        this.lockedPriority = null
    }

    /**
     * Register animations in global AnimationController
     * 
     * @param texture - texture animations are created from
     */
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

    /**
     * Listen if animation is complete and add one-time listener to it
     * 
     * @param key - animation to listen to
     * @param onComplete - function to run when listener fires
     */
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

    /** turn off animation complete listener */
    private clearCompleteListener(): void {
        if (this.completeKey && this.completeHandler) {
            this.sprite.off(this.completeKey, this.completeHandler)
        }
        this.completeKey = null
        this.completeHandler = null
    }
}
