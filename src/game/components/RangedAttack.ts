import * as Phaser from 'phaser';
import type { ProjectileDefinition } from '../data/projectiles';
import { AttackComponent, AttackEvent } from './AttackComponent';

/**
 * Ranged attack configuration:
 * Shot's timing and where projectile leaves from.
 * 
 * The counterpart to `MeleeConfig`.
 */
export interface RangedAttackConfig {
    /** What get's fired - projectile definition */
    projectile: ProjectileDefinition,
    /** What one shot costs whatever it lands on - a shot carries its damage with it rather than being charged on contact */
    damage: number,
    /** How far into the animation the shot leaves - the frames either side are the draw and the recovery */
    windupMs: number,
    /** Waited out on top of however long the animation itself took */
    cooldownMs: number,
    /** Where the shot leaves, measured from the centre of the shooter's body - `muzzleX` is mirrored with its facing, `muzzleY` is not */
    muzzleX: number,
    muzzleY: number,
}

/**
 * Everythign the scene needs to build the projectile that just left
 * The payload of `AttackEvent.Shot`.
*/
export interface Shot {
    /** spawn X coordinate */
    x: number
    /** spawn Y coordinate */
    y: number
    /** direction to spawn in */
    direction: -1 | 1
    /** damage it carries */
    damage: number
    /** projectile definition */
    projectile: ProjectileDefinition
    /** shooter - knocked back based on his position */
    shooter: Phaser.Physics.Arcade.Sprite
}

/**
 * A shot: one projectile leaving at the moment when it's drawn leaving.
 * When the shot is fired is determined by AttackComponent. 
 * 
 * It never puts anything in the world itself - it only 
 * anounches the shot and then scene decides what a projectile can hit,
 * exactly as it decides who a swing lands on.
 */
export class RangedAttack extends AttackComponent {

    /**
     * still owed a shot this attack - cleared the moment one leaves so
     * a single animation can never loose twice
     */
    private pending: boolean = false

    /**
     * @param owner - Sprite doing the attack; read the position
     * and body to place the shot.
     * @param config - Ranged attack configuration. Shots timing, muzzle, payload.
     */
    constructor(
        owner: Phaser.Physics.Arcade.Sprite,
        private config: RangedAttackConfig,
    ) {
        super(owner)
    }

    /**
     * The draw time - once the shot is away, the rest is recovery, and a caller
     * times against this is free to end the attack there.
     */
    get durationMs(): number {
        return this.config.windupMs
    }

    /** cooldown from ranged attack configuration */
    protected get cooldownMs(): number {
        return this.config.cooldownMs
    }

    /** set projectile to pending - we owe one shot */
    protected onStart(): void {
        this.pending = true
    }

    /** set projectile pending to false - cancel shot even if hasn't left yet */
    protected onEnd(): void {
        // flinched or killed before the release - the nocked arrow is dropped
        this.pending = false
    }

    /** If we are allowed, loose the owned shot - set pending to false */
    protected advance(_dt: number): void {
        if (!this.pending || this.elapsed < this.config.windupMs) return

        this.pending = false
        this.loose()
    }

    /**
     * Announce the shot from the muzzle, pointed the locked-in way.
     * Spawns nothing - the scene listens and builts the projectile.
     * 
     * @fires AttackEvent.Shot
     */
    private loose(): void {
        const body = this.owner.body as Phaser.Physics.Arcade.Body
        const { muzzleX, muzzleY, damage, projectile } = this.config

        this.emit(AttackEvent.Shot, {
            x: body.center.x + this.facing * muzzleX,
            y: body.center.y + muzzleY,
            direction: this.facing,
            damage,
            projectile,
            shooter: this.owner,
        } satisfies Shot)
    }
}
