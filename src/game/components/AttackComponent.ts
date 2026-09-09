import * as Phaser from 'phaser';

export const AttackEvent = {
    Started: "attack-started",
    Ended: "attack-ended",
    // MeleeAttack - the swing reached something it hadn't already hit
    Hit: "attack-hit",
    // RangedAttack - a shot has left, and wants putting in the world
    Shot: "attack-shot",
} as const

export type AttackEventName = typeof AttackEvent[keyof typeof AttackEvent]

/**
 * What every attack has in common: how far into it we are, when the next one is
 * allowed, and which way the attacker was pointed when it started.
 *
 * The base owns *when* an attack happens; a subclass owns *what* it does - a
 * rectangle that hurts for a few frames, or an arrow that leaves at one. Neither
 * knows what it can reach, so the scene stays the only place that decides who a
 * hit lands on, and the same class can be held by the player or by a foe.
 */
export abstract class AttackComponent extends Phaser.Events.EventEmitter {
    // ms into the current attack, -1 while there isn't one
    protected elapsed: number = -1
    // ms until the next attack is allowed to start
    protected cooldown: number = 0
    // what's left of a queued press - a press slightly too early still lands
    protected buffered: number = 0

    // locked in when the attack starts, so turning around halfway through can't
    // drag the reach - or the shot - across to the other side
    protected facing: -1 | 1 = 1

    constructor(protected owner: Phaser.Physics.Arcade.Sprite) {
        super()
    }

    // the whole attack, windup through to the end of whatever part of it can
    // actually hurt somebody - what a caller times against when there's no
    // animation to lock instead
    abstract get durationMs(): number

    // enforced after the attack ends, so a held button isn't a blender
    protected abstract get cooldownMs(): number

    // how far ahead of being allowed a press still counts - 0 for anything not
    // driven by a button, which is every foe
    protected get bufferMs(): number {
        return 0
    }

    // remember a press - the attack itself starts when the owner decides it may
    queue(): void {
        this.buffered = this.bufferMs
    }

    // begin the attack, pointed the way the owner is facing right now
    start(facing: -1 | 1): void {
        this.buffered = 0
        this.elapsed = 0
        this.facing = facing

        // before the event, so a listener that reads the subclass sees this
        // attack's state rather than the last one's
        this.onStart()
        this.emit(AttackEvent.Started)
    }

    // however the attack ended - played out, interrupted by a flinch, or cut
    // short by death - this shuts it down and starts the cooldown
    end(): void {
        if (this.elapsed < 0) return

        this.elapsed = -1
        this.cooldown = this.cooldownMs

        this.onEnd()
        this.emit(AttackEvent.Ended)
    }

    update(dt: number): void {
        if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt)
        if (this.buffered > 0) this.buffered = Math.max(0, this.buffered - dt)

        if (this.elapsed < 0) return

        this.elapsed += dt
        this.advance(dt)
    }

    // an attack that's allowed to start, whether or not anything has asked for
    // one - a foe has no button to press, its state machine polls this instead
    get isReady(): boolean {
        return this.cooldown <= 0 && this.elapsed < 0
    }

    // a press waiting on an attack that's allowed to start
    get canStart(): boolean {
        return this.buffered > 0 && this.isReady
    }

    get isAttacking(): boolean {
        return this.elapsed >= 0
    }

    destroy(): void {
        this.removeAllListeners()
    }

    // what the attack does with the time the base is counting - all optional,
    // so a subclass only overrides the moments it actually cares about
    protected onStart(): void { }
    protected onEnd(): void { }
    protected advance(_dt: number): void { }
}
