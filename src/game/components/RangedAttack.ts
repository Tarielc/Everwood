import * as Phaser from 'phaser';
import type { ProjectileDefinition } from '../data/projectiles';
import { AttackComponent, AttackEvent } from './AttackComponent';

/** A shot's timing and where it leaves from - the counterpart to `MeleeAttackConfig`, the same shape whoever holds the weapon */
export interface RangedAttackConfig {
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

// everything the scene needs to build the projectile that just left
export interface Shot {
    x: number
    y: number
    direction: -1 | 1
    damage: number
    projectile: ProjectileDefinition
    shooter: Phaser.Physics.Arcade.Sprite
}

/**
 * A shot: one projectile, leaving at the moment it's drawn leaving. Its timing
 * comes from AttackComponent, so the frames either side are the draw and the
 * recovery and neither of them hurts anybody.
 *
 * It never puts anything in the world itself - it announces the shot, and the
 * scene decides what a projectile can hit, exactly as it decides who a swing
 * lands on. That's what would let the player pick up a bow.
 */
export class RangedAttack extends AttackComponent {
    // still owed a shot this attack - cleared the moment one leaves, so a single
    // animation can never loose twice
    private pending: boolean = false

    constructor(
        owner: Phaser.Physics.Arcade.Sprite,
        private config: RangedAttackConfig,
    ) {
        super(owner)
    }

    // the draw - once the shot is away the rest is recovery, and a caller timing
    // against this is free to end the attack there
    get durationMs(): number {
        return this.config.windupMs
    }

    protected get cooldownMs(): number {
        return this.config.cooldownMs
    }

    protected onStart(): void {
        this.pending = true
    }

    protected onEnd(): void {
        // flinched or killed before the release - the nocked arrow is dropped
        this.pending = false
    }

    protected advance(_dt: number): void {
        if (!this.pending || this.elapsed < this.config.windupMs) return

        this.pending = false
        this.loose()
    }

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
