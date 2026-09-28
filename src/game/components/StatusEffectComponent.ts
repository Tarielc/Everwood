import * as Phaser from 'phaser';

/** Every stat a status effect can move */
export type Stat = "damage" | "speed" | "regen"

/**
 * One change to one stat. Adds are summed onto the base first, then the result is
 * scaled by every multiplier - so `+2` and `x1.5` on a base of 10 is 18, whichever
 * order they were picked up in
 */
export interface StatModifier {
    stat: Stat,
    op: "add" | "multiply",
    value: number,
}

/** A timed effect as the component holds it */
export interface StatusEffect {
    /** What it is - a second effect with the same id replaces the first rather than stacking */
    id: string,
    modifiers: readonly StatModifier[],
    /** The full length it was applied for */
    durationMs: number,
    /** What's left of it */
    remainingMs: number,
}

/** Events a status effect component emits - listen with `effects.on(StatusEffectEvent.X, ...)` */
export const StatusEffectEvent = {
    /** `(effect: StatusEffect)` - a new effect took hold */
    Applied: "status-effect-applied",
    /** `(effect: StatusEffect)` - an effect already running was topped back up to full */
    Refreshed: "status-effect-refreshed",
    /** `(effect: StatusEffect)` - an effect ran out, or was cleared */
    Expired: "status-effect-expired",
    /** `()` - the set of modifiers changed, so any stat read off them may have moved */
    Changed: "status-effect-changed",
} as const

/**
 * Timed stat modifiers on an entity - the buffs (and one day the debuffs) it is under.
 *
 * It owns the timers and the arithmetic, and nothing else. It doesn't know what
 * `speed` means to the entity or where its damage comes from - the owner reads a stat
 * back through {@link apply} with its own base value, or listens for `Changed` and
 * pushes the new values into whatever component uses them.
 *
 * Re-applying an effect that is already running refreshes its duration rather than
 * stacking a second copy, so picking up two damage boosts is a longer boost, not a
 * bigger one.
 */
export class StatusEffectComponent extends Phaser.Events.EventEmitter {
    /** what's running, by id */
    private readonly effects = new Map<string, StatusEffect>()

    /**
     * Put an effect on, or top it back up to full if it's already running.
     *
     * @param id - What the effect is - the same id twice refreshes rather than stacks
     * @param modifiers - What it does to the stats while it lasts
     * @param durationMs - How long it lasts
     * @fires StatusEffectEvent.Applied or StatusEffectEvent.Refreshed, then StatusEffectEvent.Changed
     */
    add(id: string, modifiers: readonly StatModifier[], durationMs: number): StatusEffect {
        const running = this.effects.get(id)

        if (running) {
            // the longer of the two - a short top-up can't cut a long one down
            running.durationMs = Math.max(running.remainingMs, durationMs)
            running.remainingMs = running.durationMs
            running.modifiers = modifiers
            this.emit(StatusEffectEvent.Refreshed, running)
            this.emit(StatusEffectEvent.Changed)
            return running
        }

        const effect: StatusEffect = { id, modifiers, durationMs, remainingMs: durationMs }
        this.effects.set(id, effect)

        this.emit(StatusEffectEvent.Applied, effect)
        this.emit(StatusEffectEvent.Changed)
        return effect
    }

    /**
     * Take an effect off early.
     *
     * @param id - Effect to remove
     * @fires StatusEffectEvent.Expired, then StatusEffectEvent.Changed
     */
    remove(id: string): void {
        const effect = this.effects.get(id)
        if (!effect) return

        this.effects.delete(id)
        this.emit(StatusEffectEvent.Expired, effect)
        this.emit(StatusEffectEvent.Changed)
    }

    /** Take every effect off - a death, a level reset */
    clear(): void {
        if (this.effects.size === 0) return

        for (const effect of [...this.effects.values()]) {
            this.effects.delete(effect.id)
            this.emit(StatusEffectEvent.Expired, effect)
        }
        this.emit(StatusEffectEvent.Changed)
    }

    /**
     * Runs every frame, from the owner's `update()`. Counts every effect down and drops
     * the ones that ran out.
     *
     * @param dt - Frame delta in ms
     */
    update(dt: number): void {
        if (this.effects.size === 0) return

        let expired = false
        for (const effect of this.effects.values()) {
            effect.remainingMs -= dt
            if (effect.remainingMs > 0) continue

            effect.remainingMs = 0
            this.effects.delete(effect.id)
            this.emit(StatusEffectEvent.Expired, effect)
            expired = true
        }

        if (expired) this.emit(StatusEffectEvent.Changed)
    }

    /**
     * A stat with every running modifier applied to it.
     *
     * @param stat - Which stat
     * @param base - What it is with nothing running - the owner's own value
     * @returns `(base + every add) * every multiplier`
     */
    apply(stat: Stat, base: number): number {
        let add = 0
        let multiply = 1

        for (const effect of this.effects.values()) {
            for (const modifier of effect.modifiers) {
                if (modifier.stat !== stat) continue
                if (modifier.op === "add") add += modifier.value
                else multiply *= modifier.value
            }
        }

        return (base + add) * multiply
    }

    /**
     * @param id - Effect to look for
     * @returns `true` while that effect is running
     */
    has(id: string): boolean {
        return this.effects.has(id)
    }

    /** Everything running right now */
    get active(): IterableIterator<StatusEffect> {
        return this.effects.values()
    }

    /** Destructor - drops the effects and the listeners without announcing it */
    destroy(): void {
        this.effects.clear()
        this.removeAllListeners()
    }
}
