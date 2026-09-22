import * as Phaser from 'phaser';
import type Foe from '../../entities/Foe';
import { FoeAnims } from '../../data/animations';
import { State } from './StateMachine';

/** List of foe states, keyd by {@link FoeStateName} */
export const FoeState = {
    Idle: "idle",     // pausing at the end of a patrol leg, or with nothing to do
    Patrol: "patrol", // wandering either side of where it spawned
    Chase: "chase",   // running the target down
    Attack: "attack", // swinging or shooting, stood still while it does
    Hurt: "hurt",     // flinching, briefly not steering itself
    Dead: "dead",     // fading out, no longer collidable
} as const

/** Keys for {@link FoeState}*/
export type FoeStateName = typeof FoeState[keyof typeof FoeState]

/** how long a flinch holds on a sheet that hasn't got a hurt animation to time it */
const HURT_STUN_MS = 520

/**
 * Play foe animation. Not every foe has every animation, so fall back to ones they do have.
 * 
 * @param foe - Foe we want to animate
 * @param name - name of the animation
 * @param fallback - name of the fallback animation
 */
function play(foe: Foe, name: keyof FoeAnims, fallback: keyof FoeAnims = "idle"): void {
    const animations = foe.getAnimations
    animations.play(animations.has(name) ? name : fallback, { restart: true })
}

/**
 * Determine whether a foe can currently sea its target.
 * 
 * @param foe - Foe we are checking
 * @param range - Range at which foe can see it's target
 * @returns `true` if foe can see it's target, `false` otherwise
 */
function canSee(foe: Foe, range: number): boolean {
    const target = foe.target
    if (!target || !target.active) return false

    // an infinite range is a foe that simply always knows where the target is. the
    // vertical reach is the other half of the same sight check, so it goes with it -
    // otherwise a jump would still break line of sight on a foe that has none to break
    if (!Number.isFinite(range)) return true

    const definition = foe.definition
    return Math.abs(target.x - foe.x) <= range
        && Math.abs(target.y - foe.y) <= definition.verticalReach
}

/**
 * Check whether a foe can attack or not
 * close enought to commit and no cooldown
 * 
 * @param foe - Foe we are checking
 * @returns `true` if target is in range and foe attack is ready, `false` otherwise
 */
function canAttack(foe: Foe): boolean {
    const attack = foe.definition.attack
    if (!attack) return false

    // cann see here used to detect if target is in attack range
    return foe.isAttackReady && canSee(foe, attack.range)
}

/**
 * Determine the direction of target, relative to foe
 * 
 * if target is dead or doesn't exist, foe is facing the same way as before
 * 
 * @param foe - Foe we are checking
 * @returns `-1` if foetarget is lef,
 *  `1` if target is right,
 *  `patrolDirection` if target doesn't exists
 */
function directionToTarget(foe: Foe): -1 | 1 {
    const target = foe.target
    if (!target) return foe.patrolDirection
    return target.x < foe.x ? -1 : 1
}

/**
 * Does foe need to run around?
 * 
 * Foe either walked past it's patrol area or walked into a solid object (or wolrd border)
 * 
 * @param foe - Foe we are checking
 * @returns `true` if foe is blocked OR on patrol border,
 *  `false` otherwise
 */
function shouldTurnAround(foe: Foe): boolean {
    const body = foe.body as Phaser.Physics.Arcade.Body

    const blocked = foe.patrolDirection < 0
        ? body.blocked.left || body.touching.left
        : body.blocked.right || body.touching.right

    const onPatrolBorder = foe.patrolDirection < 0
        ? foe.homeX - foe.x > foe.definition.patrolRange
        : foe.x - foe.homeX > foe.definition.patrolRange

    return blocked || onPatrolBorder
}

/**
 * Whenever foe attack or flinch is over - back on the hunt, or chase, if
 * foe can still see it's target.
 *  
 * @param foe - Foe we are checking
 * @returns returns `FoeStateName` revert back
 */
function recoverState(foe: Foe): FoeStateName {
    return canSee(foe, foe.definition.deAggroRange) ? FoeState.Chase : FoeState.Idle
}

/**
 * Create all foe states, one for each {@link FoeState}
 * 
 * Every foe registers its own set with `addStates()` and starts in {@link FoeState.Idle}
 * 
 * @returns the list of states, readu to add to a foe's `StateMachine`
 */
export function createFoeStates(): State<Foe>[] {
    return [
        {
            name: FoeState.Idle,
            enter(foe) {
                foe.setVelocityX(0)
                foe.getAnimations.play("idle")
            },
            update(foe) {
                if (canSee(foe, foe.definition.aggroRange)) {
                    return foe.states.transition(FoeState.Chase)
                }

                // look around for a beat, then set off the other way
                if (foe.states.stateTime >= foe.definition.pauseMs) {
                    foe.turnAround()
                    foe.states.transition(FoeState.Patrol)
                }
            },
        },
        {
            name: FoeState.Patrol,
            enter(foe) {
                foe.getAnimations.play("run")
            },
            update(foe) {
                if (canSee(foe, foe.definition.aggroRange)) {
                    return foe.states.transition(FoeState.Chase)
                }

                if (shouldTurnAround(foe)) return foe.states.transition(FoeState.Idle)
                foe.walk(foe.patrolDirection, foe.definition.speed)
            },
        },
        {
            name: FoeState.Chase,
            enter(foe) {
                foe.getAnimations.play("run")
            },
            update(foe) {
                // the wider range here is what stops the chase flickering on and off
                if (!canSee(foe, foe.definition.deAggroRange)) {
                    return foe.states.transition(FoeState.Idle)
                }

                if (canAttack(foe)) return foe.states.transition(FoeState.Attack)

                // an archer walked down to arm's length gives ground instead of
                // standing there being hit - it needs the room to draw again
                const gap = foe.target ? Math.abs(foe.target.x - foe.x) : Infinity
                const toward = directionToTarget(foe)
                const away: -1 | 1 = toward === 1 ? -1 : 1

                foe.walk(gap < foe.standoffRange ? away : toward, foe.definition.chaseSpeed)
            },
        },
        {
            // the swing or the draw - the foe plants itself for the whole of it, and
            // the animation's own lock is what decides how long that is
            name: FoeState.Attack,
            enter(foe) {
                foe.setVelocityX(0)
                foe.beginAttack()
                play(foe, "attack")
            },
            update(foe) {
                foe.setVelocityX(0)

                // a sheet without an attack animation has nothing to lock, so the
                // attack's own timing is what ends the state instead - isAttacking
                // wouldn't do, it stays true until exit() runs and would deadlock
                const busy = foe.getAnimations.has("attack")
                    ? foe.getAnimations.isLocked
                    : foe.states.stateTime < foe.attackDurationMs

                if (!busy) foe.states.transition(recoverState(foe))
            },
            exit(foe) {
                // closes the hit area or drops the nocked arrow, however this ended -
                // played out, flinched out of, or cut short by death
                foe.endAttack()
            },
        },
        {
            // entered from the health listener - the knockback is applied there, this
            // state just keeps the foe from steering out of it for a moment
            name: FoeState.Hurt,
            enter(foe) {
                play(foe, "hurt")
            },
            update(foe) {
                // a sheet with a flinch drawn on it holds for exactly as long as that
                // plays; the rest fall back to a fixed stun on their idle frames
                const stunned = foe.getAnimations.has("hurt")
                    ? foe.getAnimations.isLocked
                    : foe.states.stateTime < HURT_STUN_MS

                // a knockback can outlast the flinch - hold until it lands, so the
                // foe doesn't start walking (or zero its shove) in mid-air
                if (stunned || !foe.isGrounded) return

                // come out of it angry, if whatever hit it is still in reach
                foe.states.transition(recoverState(foe))
            },
        },
        {
            name: FoeState.Dead,
            enter(foe) {
                // collapse() owns the animation too - a sheet that can fall over does,
                // and only then does the fade start
                foe.collapse()
            },
            // no update - the fade tween owns what happens next, and ends in destroy()
        },
    ]
}
