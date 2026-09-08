import * as Phaser from 'phaser';
import type Foe from '../../entities/Foe';
import { State } from './StateMachine';

// states of a foe
export const FoeState = {
    Idle: "idle",     // pausing at the end of a patrol leg, or with nothing to do
    Patrol: "patrol", // wandering either side of where it spawned
    Chase: "chase",   // running the target down
    Hurt: "hurt",     // flinching, briefly not steering itself
    Dead: "dead",     // fading out, no longer collidable
} as const

export type FoeStateName = typeof FoeState[keyof typeof FoeState]

// how long a flinch holds before the foe starts steering again
const HURT_STUN_MS = 1020

// can the foe currently see its target? `range` differs on the way in and out of a
// chase, so a target hovering at the boundary can't strobe the state every frame
function canSee(foe: Foe, range: number): boolean {
    const target = foe.target
    if (!target || !target.active) return false

    const definition = foe.definition
    return Math.abs(target.x - foe.x) <= range
        && Math.abs(target.y - foe.y) <= definition.verticalReach
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

                foe.walk(directionToTarget(foe), foe.definition.chaseSpeed)
            },
        },
        {
            // entered from the health listener - the knockback is applied there, this
            // state just keeps the foe from steering out of it for a moment
            name: FoeState.Hurt,
            enter(foe) {
                foe.getAnimations.play("idle")
            },
            update(foe) {
                if (foe.states.stateTime < HURT_STUN_MS) return

                // come out of it angry, if whatever hit it is still in reach
                foe.states.transition(
                    canSee(foe, foe.definition.deAggroRange) ? FoeState.Chase : FoeState.Idle
                )
            },
        },
        {
            name: FoeState.Dead,
            enter(foe) {
                foe.getAnimations.stop()
                foe.collapse()
            },
            // no update - the fade tween owns what happens next, and ends in destroy()
        },
    ]
}
