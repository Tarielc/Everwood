import * as Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';

export interface HealthConfig {
    max: number,
    invulnerabilityMs: number, // i-frames after taking a hit, blocks further damage
    regenPerSecond: number, // set to 0 to disable regeneration
    regenDelayMs: number, // wait this long healthEventKeyafter the last hit before regen kicks in
}

export interface HealthComponentOptions {
    // start below max (a wounded enemy, a loaded save), defaults to a full bar
    current?: number
    // mirror every event onto the global EventBus as `${busPrefix}:health-changed` etc,
    // so UI scenes can listen without holding a reference to the entity
    busPrefix?: string
}

// payload sent with every health event - UI only needs `ratio`, gameplay may want the rest
export interface HealthChange {
    current: number
    previous: number
    max: number
    ratio: number
    amount: number // positive when healed, negative when damaged
    source?: unknown // whatever dealt the damage, passed straight through
}

export const HealthEvent = {
    Changed: "health-changed", // fires for damage, heal, revive and max changes
    Damaged: "health-damaged",
    Healed: "health-healed",
    Died: "health-died",
    Revived: "health-revived",
    InvulnerabilityEnd: "health-invulnerability-end",
} as const

export type HealthEventName = typeof HealthEvent[keyof typeof HealthEvent]

// the `source` regen heals carry - lets listeners tell a passive trickle from a real heal
export const REGEN_SOURCE = "regen"

// the key an event travels under on the global EventBus - the emitter and every
// listener build it the same way, so a renamed prefix can't silently unhook a HUD
export function healthEventKey(busPrefix: string, event: HealthEventName): string {
    return `${busPrefix}:${event}`
}

export class HealthComponent extends Phaser.Events.EventEmitter {
    private hp: number
    private maxHp: number

    // remaining i-frames, counts down to 0
    private invulnerabilityTimer: number = 0
    // time since the last hit, counts up until regen is allowed to start
    private sinceDamage: number = 0
    // leftover fractional regen, so a slow trickle isn't lost to rounding every frame
    private regenCarry: number = 0

    private dead: boolean = false

    private readonly busPrefix?: string

    constructor(
        private config: HealthConfig,
        options: HealthComponentOptions = {},
    ) {
        super()

        this.maxHp = Math.max(1, config.max)
        this.hp = Phaser.Math.Clamp(options.current ?? this.maxHp, 0, this.maxHp)
        this.busPrefix = options.busPrefix

        this.dead = this.hp <= 0
        // start regen-ready, an entity that spawns wounded shouldn't wait out the delay
        this.sinceDamage = config.regenDelayMs
    }

    update(dt: number): void {
        if (this.invulnerabilityTimer > 0) {
            this.invulnerabilityTimer = Math.max(0, this.invulnerabilityTimer - dt)
            // lets a hurt state drop the moment the entity can be hit again
            if (this.invulnerabilityTimer === 0) this.dispatch(HealthEvent.InvulnerabilityEnd)
        }

        this.updateRegen(dt)
    }

    // returns true when the hit landed - false means it was absorbed by i-frames,
    // so callers can skip the hit spark, the knockback and the sound
    damage(amount: number, source?: unknown): boolean {
        if (this.dead || amount <= 0) return false
        if (this.invulnerabilityTimer > 0) return false

        this.invulnerabilityTimer = this.config.invulnerabilityMs
        this.sinceDamage = 0
        this.regenCarry = 0

        // clamp before applying, so `amount` on the payload is the damage actually taken
        const change = this.apply(-Math.min(amount, this.hp), source)

        this.dispatch(HealthEvent.Damaged, change)
        this.dispatch(HealthEvent.Changed, change)

        if (this.hp <= 0) this.die(source)
        return true
    }

    // returns true when health was actually restored - the dead need revive(), not heal()
    heal(amount: number, source?: unknown): boolean {
        if (this.dead || amount <= 0 || this.isFull) return false

        const change = this.apply(Math.min(amount, this.maxHp - this.hp), source)

        this.dispatch(HealthEvent.Healed, change)
        this.dispatch(HealthEvent.Changed, change)
        return true
    }

    // straight to 0, ignoring i-frames - for pits, scripted deaths and debug keys
    kill(source?: unknown): void {
        if (this.dead) return

        const change = this.apply(-this.hp, source)

        this.dispatch(HealthEvent.Damaged, change)
        this.dispatch(HealthEvent.Changed, change)
        this.die(source)
    }

    // back from the dead - defaults to a full bar, and grants i-frames so the
    // respawn isn't eaten by whatever is still standing on top of the entity
    revive(current?: number, invulnerabilityMs?: number): void {
        const target = Phaser.Math.Clamp(current ?? this.maxHp, 1, this.maxHp)
        const change = this.apply(target - this.hp)

        this.dead = false
        this.sinceDamage = this.config.regenDelayMs
        this.regenCarry = 0
        this.invulnerabilityTimer = invulnerabilityMs ?? this.config.invulnerabilityMs

        this.dispatch(HealthEvent.Revived, change)
        this.dispatch(HealthEvent.Changed, change)
    }

    // raise or lower the ceiling (a level up, a curse) - `keepRatio` scales current
    // health with it, otherwise the bar keeps its value and only the ceiling moves
    setMax(max: number, keepRatio: boolean = false): void {
        const next = Math.max(1, max)
        if (next === this.maxHp) return

        const ratio = this.ratio
        this.maxHp = next

        const target = keepRatio
            ? Math.round(next * ratio)
            : Math.min(this.hp, next)

        const change = this.apply(target - this.hp)
        this.dispatch(HealthEvent.Changed, change)

        if (this.hp <= 0 && !this.dead) this.die()
    }

    // i-frames from something other than a hit - a dodge roll, a respawn cutscene
    makeInvulnerable(durationMs: number): void {
        this.invulnerabilityTimer = Math.max(this.invulnerabilityTimer, durationMs)
    }

    clearInvulnerability(): void {
        if (this.invulnerabilityTimer === 0) return

        this.invulnerabilityTimer = 0
        this.dispatch(HealthEvent.InvulnerabilityEnd)
    }

    // full reset back to a fresh entity - for a pooled enemy handed out again
    reset(current?: number): void {
        this.hp = Phaser.Math.Clamp(current ?? this.maxHp, 0, this.maxHp)
        this.dead = this.hp <= 0
        this.invulnerabilityTimer = 0
        this.sinceDamage = this.config.regenDelayMs
        this.regenCarry = 0

        this.dispatch(HealthEvent.Changed, this.snapshot(this.hp, 0))
    }

    get current(): number {
        return this.hp
    }

    get max(): number {
        return this.maxHp
    }

    get ratio(): number {
        return this.hp / this.maxHp
    }

    get isDead(): boolean {
        return this.dead
    }

    get isFull(): boolean {
        return this.hp >= this.maxHp
    }

    get isInvulnerable(): boolean {
        return this.invulnerabilityTimer > 0
    }

    // remaining i-frames in ms - lets a hurt state hold exactly as long as they do
    get invulnerabilityRemaining(): number {
        return this.invulnerabilityTimer
    }

    destroy(): void {
        this.removeAllListeners()
    }

    // trickle health back once the entity has been out of combat long enough
    private updateRegen(dt: number): void {
        if (this.dead || this.config.regenPerSecond <= 0 || this.isFull) return

        if (this.sinceDamage < this.config.regenDelayMs) {
            this.sinceDamage += dt
            return
        }

        this.regenCarry += this.config.regenPerSecond * (dt / 1000)
        if (this.regenCarry < 1) return

        // heal in whole points, keeping the remainder for the next frame
        const whole = Math.floor(this.regenCarry)
        this.regenCarry -= whole
        this.heal(whole, REGEN_SOURCE)
    }

    // the single place hp moves, so every event carries a consistent payload
    private apply(delta: number, source?: unknown): HealthChange {
        const previous = this.hp
        this.hp = Phaser.Math.Clamp(this.hp + delta, 0, this.maxHp)
        return this.snapshot(previous, this.hp - previous, source)
    }

    private snapshot(previous: number, amount: number, source?: unknown): HealthChange {
        return {
            current: this.hp,
            previous,
            max: this.maxHp,
            ratio: this.ratio,
            amount,
            source,
        }
    }

    private die(source?: unknown): void {
        this.dead = true
        this.regenCarry = 0

        // the killing blow's own i-frames end here - announced, so anything driven by
        // them (a blink, a hurt state) is cleaned up instead of frozen mid-flicker
        this.clearInvulnerability()

        this.dispatch(HealthEvent.Died, this.snapshot(this.hp, 0, source))
    }

    // emit locally for whoever owns the component, then mirror onto the global
    // bus so scenes that never see the entity (the HUD) can follow along
    private dispatch(event: HealthEventName, change?: HealthChange): void {
        this.emit(event, change)
        if (this.busPrefix) EventBus.emit(healthEventKey(this.busPrefix, event), change)
    }
}
