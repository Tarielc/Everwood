import * as Phaser from 'phaser';

/**
 * Events every attackcomponent emits - listenr with
 * `attack.on(AttackEvent.EVNET, ...)
 * 
 * Keyed byt {@link AttackEventName}
 */
export const AttackEvent = {
    /** An attack has begun */
    Started: "attack-started",
    /** An attack is over, however it ended, and the cooldown has started */
    Ended: "attack-ended",
    /** `MeleeAttack` only : the swing reached something it had's already hit */
    Hit: "attack-hit",
    /** `RangedAttack` only : a shot has left and needs to be putt in the world */
    Shot: "attack-shot",
} as const
/** Keys of {@link AttackEvent}*/
export type AttackEventName = typeof AttackEvent[keyof typeof AttackEvent]

/**

/**
 * What every attack has in common: timer, whether attack is available,
 * which way was attacker facing.
 * 
 * The base owns *when* an attack happes; a subclass owns *what* happens - a melee
 * rectangle that hurts for a few seconds, or a projectile. Neither of them knows
 * what it hits - the scene stays the only place that decide who as hit lands on.
 * 
 * Lifecycle: `queue()` (button-driven owners only) → `start()` → `update()` every
 * frame → `end()`. Subclasses hook in through `onStart()`, `advance()` and `onEnd()`.
 */
export abstract class AttackComponent extends Phaser.Events.EventEmitter {
    /** ms in the current attack, `-1` while there isn't one  */
    protected elapsed: number = -1
    /** ms until next attack is allowed */
    protected cooldown: number = 0
    // what's left of a queued press - a press slightly too early still lands
    /** queue press - a press slightly early still lands */
    protected buffered: number = 0

    /**
     * Facing direction, locked in when it starts, so turning around can't
     * drag the reach - or the shot - across the other side.
     */
    protected facing: -1 | 1 = 1

    /**
     * @param owner - Sprite doing the attack; subclasses read the position
     * and body to place the hit area or the shot.
     */
    constructor(protected owner: Phaser.Physics.Arcade.Sprite) {
        super()
    }

    /**
     * The whole attack, from windup to the end of whatever part of it
     * can actually hurt somebody - what a caller times against when there's
     * no animation to lock instead
     */
    abstract get durationMs(): number

    /** cooldown between two attacks, so a held buttons isn't a blender */
    protected abstract get cooldownMs(): number

    /**
     * how far ahead of being allowed to attack stil queues attack -
     * `0` for anything not driven by a button (every foe).
     */
    protected get bufferMs(): number {
        return 0
    }

    /**
     * remember a press. The attack itself starts only when the owner
     * decides it may - see `canStart`
     */
    queue(): void {
        this.buffered = this.bufferMs
    }

    /**
     * Begin attack,consuming any queued press. Doesn't check `isReady`
     * that's the caller's job.
     * 
     * @param facing - the way the owner is facing right now. Locked for whole attack period.
     * @fires AttackEvent.Started
     */
    start(facing: -1 | 1): void {
        this.buffered = 0
        this.elapsed = 0
        this.facing = facing

        // before the event, so a listener that reads the subclass sees this
        // attack's state rather than the last one's
        this.onStart()
        this.emit(AttackEvent.Started)
    }

    /**
     * End attack - shut it down and start cooldown.
     * 
     * Does nothing if no attack is running currently.
     * 
     * @fires AttackEvent.Ended
     */
    end(): void {
        if (this.elapsed < 0) return

        this.elapsed = -1
        this.cooldown = this.cooldownMs

        this.onEnd()
        this.emit(AttackEvent.Ended)
    }

    /**
     * update run every frame from `Owner.update()`
     * 
     * Tick the cooldown and queued press, then advance the running attack.
     * 
     * @param dt - frame delta in ms
     */
    update(dt: number): void {
        if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt)
        if (this.buffered > 0) this.buffered = Math.max(0, this.buffered - dt)

        if (this.elapsed < 0) return

        this.elapsed += dt
        this.advance(dt)
    }

    /**
     * An attack that's allowed to start, whether or not anything asked for one - 
     * a foe has no button to press, its state machine polss this instead.
    */
    get isReady(): boolean {
        return this.cooldown <= 0 && this.elapsed < 0
    }

    /** a press waiting on an attack that's allowed to start */
    get canStart(): boolean {
        return this.buffered > 0 && this.isReady
    }

    /** `true` if currently attacking */
    get isAttacking(): boolean {
        return this.elapsed >= 0
    }

    /** destructor - remove listeners */
    destroy(): void {
        this.removeAllListeners()
    }

    // what the attack does with the time the base is counting - all optional,
    // so a subclass only overrides the moments it actually cares about

    /** Called by `start()` before `Started` is emitted */
    protected onStart(): void { }
    /** Called by `end()` before `Ended` is emitted */
    protected onEnd(): void { }
    /**
     * Called every frame while an attack is running,
     * as long as `elapsed` > 0 (we are in an attack)
     */
    protected advance(_dt: number): void { }
}
