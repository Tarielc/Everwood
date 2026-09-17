import * as Phaser from 'phaser';
import type Player from '../../entities/Player';
import { State } from './StateMachine';
import { PLAYER_MOVEMENT } from '../../data/player';

/** List of player states, keyd by {@link PlayerStateName} */
export const PlayerState = {
    Idle: "idle",
    Walk: "walk",
    Sprint: "sprint",
    Jump: "jump",
    Fall: "fall",
    Attack: "attack",
    Hurt: "hurt",
    Dead: "dead",
} as const

/** Keys for {@link PlayerState}*/
export type PlayerStateName = typeof PlayerState[keyof typeof PlayerState]

/** If playe speed is beloe this value, player stat counts as idle */
const IDLE_SPEED_EPSILON = 10

/**
 * Check if player is touching the ground
 * @param player - Player to check
 * @returns `true` if player is touching ground, `false` otherwise
 */
function isGrounded(player: Player): boolean {
    const body = player.body as Phaser.Physics.Arcade.Body
    return body.blocked.down || body.touching.down
}

/**
 * Check whether player is moving or not
 * 
 * Mocing speed must be higher then `IDLE_SPEED_EPSILOn`
 * @param player - Player to check
 * @returns `true` if movement button is pressed or velocity is higher than `IDLE_SPEED_EPSILON`
 *  `false` otherwise.
 */
function isMoving(player: Player): boolean {
    const body = player.body as Phaser.Physics.Arcade.Body
    return player.inputState.moveLeft
        || player.inputState.moveRight
        || Math.abs(body.velocity.x) > IDLE_SPEED_EPSILON
}

/**
 * The state to fall back into once a flick is over
 * 
 * Airborne wins over grounded
 * 
 * @param player - Player to check
 * @returns player state name to fall back to
 */
function recoverState(player: Player): PlayerStateName {
    return airborneState(player) ?? groundedState(player)
}

// grounded state of the player that encompases possbiel states together
/**
 * Check which grounded state the player is in
 * 
 * @param player - Player to check
 * @returns either player state `sprint` or `walk` based on speed if player is moving,
 *  `idle` if player isn't moving
 */
function groundedState(player: Player): PlayerStateName {
    const body = player.body as Phaser.Physics.Arcade.Body
    return isMoving(player)
        ? Math.abs(body.velocity.x) > PLAYER_MOVEMENT.speed
            ? PlayerState.Sprint
            : PlayerState.Walk
        : PlayerState.Idle
}

// airborne state of the player that encompases possible states together
/**
 * Check which airborne state the player is in
 * 
 * If player is grounded, abort
 * 
 * @param player - Player to check
 * @returns player state `Jump` if Y speed is less than a 0,
 *  `Fall` otherwise.
 */
function airborneState(player: Player): PlayerStateName | null {
    if (isGrounded(player)) return null
    const body = player.body as Phaser.Physics.Arcade.Body
    return body.velocity.y < 0 ? PlayerState.Jump : PlayerState.Fall
}

// create all the player states
/**
 * Create all player states, one for each {@link PlayerState}
 * 
 * Player starts in idle state
 * 
 * @returns the list of states, ready to add to Players `StateMachine`
 */
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
            // entered from Player.update() once the swing is allowed, not by polling
            // here - the cooldown and the buffered press live in the attack component,
            // and this state is only what a swing looks like while it happens
            name: PlayerState.Attack,
            enter(player) {
                // the swing keeps the direction it started with, so spinning round
                // halfway through can't drag the hit area across with it
                player.getAttack.start(player.getAnimations.facing)
                player.getAnimations.play("attack", { restart: true })
            },
            update(player) {
                // the swing animation locks itself, so windup, hit and recovery all
                // last exactly as long as they're drawn for
                if (!player.getAnimations.isLocked) player.states.transition(recoverState(player))
            },
            exit(player) {
                // closes the hit area and starts the cooldown however this ended -
                // played out, interrupted by a flinch, or cut short by death
                player.getAttack.end()
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
