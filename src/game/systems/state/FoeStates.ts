import * as Phaser from 'phaser';
import type Foe from '../../entities/Foe';
import { FoeAnims } from '../../utils/constants';
import { State } from './StateMachine';

// states of a foe
export const FoeState = {
    Idle: "idle",     // pausing at the end of a patrol leg, or with nothing to do
    Patrol: "patrol", // wandering either side of where it spawned
    Chase: "chase",   // running the target down
    Attack: "attack", // swinging or shooting, stood still while it does
    Hurt: "hurt",     // flinching, briefly not steering itself
    Dead: "dead",     // fading out, no longer collidable
} as const

export type FoeStateName = typeof FoeState[keyof typeof FoeState]

// how long a flinch holds on a sheet that hasn't got a hurt animation to time it
const HURT_STUN_MS = 520

// not every sheet has every animation - fall back to a frame it definitely has,
// rather than asking for one that isn't there
function play(foe: Foe, name: keyof FoeAnims, fallback: keyof FoeAnims = "idle"): void {
    const animations = foe.getAnimations
    animations.play(animations.has(name) ? name : fallback, { restart: true })
}

// can the foe currently see its target? `range` differs on the way in and out of a
// chase, so a target hovering at the boundary can't strobe the state every frame
function canSee(foe: Foe, range: number): boolean {
    const target = foe.target
    if (!target || !target.active) return false

    const definition = foe.definition
    return Math.abs(target.x - foe.x) <= range
        && Math.abs(target.y - foe.y) <= definition.verticalReach
}

// close enough to commit, and off cooldown - a foe without an attack never is
function canAttack(foe: Foe): boolean {
    const attack = foe.definition.attack
    if (!attack) return false

    // cann see here used to detect if target is in attack range
    return foe.isAttackReady && canSee(foe, attack.range)
}

// -1 or 1 toward the target, or the way the foe already faces if there isn't one
function directionToTarget(foe: Foe): -1 | 1 {
    const target = foe.target
    if (!target) return foe.patrolDirection
    return target.x < foe.x ? -1 : 1
}

// walked past its leash, or run into a wall
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

// where a foe goes once an attack or a flinch is over - back on the hunt if
// whatever it was dealing with is still in reach
function recoverState(foe: Foe): FoeStateName {
    return canSee(foe, foe.definition.deAggroRange) ? FoeState.Chase : FoeState.Idle
}

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

                // come out of it angry, if whatever hit it is still in reach
                if (!stunned) foe.states.transition(recoverState(foe))
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
