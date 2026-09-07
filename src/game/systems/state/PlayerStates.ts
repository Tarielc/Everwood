import * as Phaser from 'phaser';
import type Player from '../../entities/Player';
import { State } from './StateMachine';
import { PLAYER_MOVEMENT } from '../../utils/constants';

// states of the player
export const PlayerState = {
    Idle: "idle",
    Walk: "walk",
    Sprint: "sprint",
    Jump: "jump",
    Fall: "fall",
    Hurt: "hurt",
    Dead: "dead",
} as const

export type PlayerStateName = typeof PlayerState[keyof typeof PlayerState]

// if speed is below this value, player state is `idle`
const IDLE_SPEED_EPSILON = 10

// check if player is touching the ground
function isGrounded(player: Player): boolean {
    const body = player.body as Phaser.Physics.Arcade.Body
    return body.blocked.down || body.touching.down
}

// return true if player is moving, or speed is above IDLE_SPEED_EPSILON
function isMoving(player: Player): boolean {
    const body = player.body as Phaser.Physics.Arcade.Body
    return player.inputState.moveLeft
        || player.inputState.moveRight
        || Math.abs(body.velocity.x) > IDLE_SPEED_EPSILON
}

// the state to fall back into once a flinch is over - airborne wins over grounded
function recoverState(player: Player): PlayerStateName {
    return airborneState(player) ?? groundedState(player)
}

// grounded state of the player that encompases possbiel states together
function groundedState(player: Player): PlayerStateName {
    const body = player.body as Phaser.Physics.Arcade.Body
    return isMoving(player)
        ? Math.abs(body.velocity.x) > PLAYER_MOVEMENT.speed
            ? PlayerState.Sprint
            : PlayerState.Walk
        : PlayerState.Idle
}

// airborne state of the player that encompases possible states together
function airborneState(player: Player): PlayerStateName | null {
    if (isGrounded(player)) return null
    const body = player.body as Phaser.Physics.Arcade.Body
    return body.velocity.y < 0 ? PlayerState.Jump : PlayerState.Fall
}

// create all the player states
export function createPlayerStates(): State<Player>[] {
    return [
        {
            name: PlayerState.Idle,
            enter(player) {
                player.getAnimations.play("idle")
            },
            update(player) {
                const airborne = airborneState(player)
                if (airborne) return player.states.transition(airborne)

                if (isMoving(player)) player.states.transition(groundedState(player))
            },
        },
        {
            name: PlayerState.Walk,
            enter(player) {
                player.getAnimations.play("walk")
            },
            update(player) {
                const airborne = airborneState(player)
                if (airborne) return player.states.transition(airborne)
                
                if (isGrounded(player)) player.states.transition(groundedState(player))
            },
        },
        {
            name: PlayerState.Sprint,
            enter(player) {
                player.getAnimations.play("sprint")
            },
            update(player) {
                const airborne = airborneState(player)
                if (airborne) return player.states.transition(airborne)

                if (isGrounded(player)) player.states.transition(groundedState(player))
            },
        },
        {
            name: PlayerState.Jump,
            enter(player) {
                player.getAnimations.play("jump")
            },
            update(player) {
                if (isGrounded(player)) return player.states.transition(groundedState(player))

                const body = player.body as Phaser.Physics.Arcade.Body
                if (body.velocity.y >= 0) player.states.transition(PlayerState.Fall)
            },
        },
        {
            name: PlayerState.Fall,
            enter(player) {
                player.getAnimations.play("fall")
            },
            update(player) {
                if (isGrounded(player)) return player.states.transition(groundedState(player))

                const body = player.body as Phaser.Physics.Arcade.Body
                if (body.velocity.y < 0) player.states.transition(PlayerState.Jump)
            },
        },
        {
            // entered from Player's health listener, not by polling - a flinch that
            // leaves the player in control, it only takes over the animation
            name: PlayerState.Hurt,
            enter(player) {
                player.getAnimations.play("hurt", { restart: true })
            },
            update(player) {
                // the hurt animation locks itself, so the flinch lasts exactly as
                // long as it plays instead of being timed twice in two places
                if (!player.getAnimations.isLocked) player.states.transition(recoverState(player))
            },
        },
        {
            name: PlayerState.Dead,
            enter(player) {
                // drop where they stand - gravity still applies, input no longer does
                const body = player.body as Phaser.Physics.Arcade.Body
                body.setAccelerationX(0)
                body.setVelocityX(0)

                player.getAnimations.play("death", { restart: true, force: true })
            },
            // no update - only revive() leaves this state, through the health listener
        },
    ]
}
