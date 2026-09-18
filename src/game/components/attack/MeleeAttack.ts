import * as Phaser from 'phaser';
import { AttackComponent, AttackEvent } from './attack/AttackComponent';

/**
 * Meele attack configuration:
 * Swing's timing, reach.
 * 
 * The counterpart of `RangedAttack`
*/
export interface MeleeAttackConfig {
    /** How far into the animation the hit area opens - the rest of the animation is windup and recovery, and hurts nobody */
    windupMs: number,
    /** How long the hit area stays open */
    activeMs: number,
    /** Enforced after the swing ends for cooldwon, so a held button isn't a blender */
    cooldownMs: number,
    /** A press sligthly early swing being allowed, still counts */
    bufferMs: number,
    /** The hit area in world pixels, measured out from the edge of the attacker's body - not scaled with the sprite */
    width: number,
    height: number,
    offsetX: number,
    /** Negative reaches above the attacker's middle */
    offsetY: number,
}

/**
 * Anything a swing can connect with - the component only needs to tell two
 * of them apart, the scene decides what actually counts as a target
 */
export interface Attackable extends Phaser.GameObjects.GameObject {
    x: number
    y: number
}

/** outline colour of the hit area while arcade's debug draw is on */
const DEBUG_COLOR = 0xff3355


/**
 * A meele swing: its reach, and the bookkeeping that stops one swing
 * from hittinh the same target twice. When its drawns is determined by AttackComponent.
 * 
 * It owns no physics body, the hit area is a plain rectangle that only exists
 * during the active window, so the component never has to know what a foe is - 
 * the scene tests the recatangle against whatever it considers hittable,
 * which is how the player and the warrior both swing with this same class.
 */
export class MeleeAttack extends AttackComponent {
    /** eveything this swing has already connected with */
    private connected: Set<Attackable> = new Set()

    /** reused - a swing shouldn't allocate reactangle every frame */
    private readonly area: Phaser.Geom.Rectangle = new Phaser.Geom.Rectangle()

    /** debug graphics */
    private debug: Phaser.GameObjects.Graphics | null = null

    /** A config handed over the mid-swing, waiting for that swing to finish */
    private pending: MeleeAttackConfig | null = null

    /**
     * @param owner Sprite doing the attack; read the position
     * and body to place the swing in front.
     * @param config - first swing's timing and reach - see `setConfig()` to change it
     */
    constructor(
        owner: Phaser.Physics.Arcade.Sprite,
        private config: MeleeAttackConfig,
    ) {
        super(owner)
    }

    /** the swing time - from animation start until the swing window is open */
    get durationMs(): number {
        return this.config.windupMs + this.config.activeMs
    }

    /** cooldown from meele attack configuration */
    protected get cooldownMs(): number {
        return this.config.cooldownMs
    }

    /** buffer ms from attack configuration - how early before swing end still registers */
    protected get bufferMs(): number {
        return this.config.bufferMs
    }

    /**
     * Used when changing equipment.
     * 
     * Set the timing and reach of the next swing. One already underway keeps the config
     * it started with, so swapping weapons can't reshape it halfway through.
     * 
     * @param config - new meele attack configuration
     */
    setConfig(config: MeleeAttackConfig): void {
        if (this.isAttacking) this.pending = config
        else this.config = config
    }

    /**
     * The base tick, plus debug outline
     * 
     * @param dt - Time change since last frame
     */
    update(dt: number): void {
        super.update(dt)

        // outside the base's "only while attacking" tick, so the outline is
        // cleared on the frame the window shuts instead of being left on screen
        this.drawDebug()
    }

    /**
     * Register a hit on `target`. Doesn't test overlap, the caller has already
     * checked `target` against `hitArea`. The caller also deals the damage.
     * 
     * @param target - things caller found inside `hitArea`
     * @returns `true` the first time melee attack hitbox overlaps with target while window
     * is open, `false` if the window is hust ot `target` was already hit.
     * @fires AttackEvent.Hit with `target`
     */
    registerHit(target: Attackable): boolean {
        if (!this.isWindowOpen || this.connected.has(target)) return false

        this.connected.add(target)
        this.emit(AttackEvent.Hit, target)
        return true
    }

    /** the frames that actually hurt target, between the windup and the recovery */
    get isWindowOpen(): boolean {
        const { windupMs, activeMs } = this.config
        return this.elapsed >= windupMs && this.elapsed < windupMs + activeMs
    }

    /** attack box area while swing window is open, `null` otherwise */
    get hitArea(): Phaser.Geom.Rectangle | null {
        return this.isWindowOpen ? this.area : null
    }

    /** Destructor and cleanup */
    destroy(): void {
        this.debug?.destroy()
        this.debug = null
        this.connected.clear()
        super.destroy()
    }

    /** Forget last swing's targets and place the hit area */
    protected onStart(): void {
        this.connected.clear()
        // land on this frame's reach immediately, rather than a frame behind
        this.reposition()
    }

    /** Forget current swing's targets and start cooldown */
    protected onEnd(): void {
        this.connected.clear()

        // after the base has already charged this swing's own cooldown
        if (this.pending) {
            this.config = this.pending
            this.pending = null
        }
    }

    /** reposition attack box, so it's always in front of the owner */
    protected advance(_dt: number): void {
        // make sure attack box is repositioned, so it'd always in front of a sprite, not somwhere middle
        // usefuleness of this line is depicted well if we clear platnFeet() function of a player
        this.reposition()
    }

    /**
     * Park the hit area in front of the owner, measured from the edge of it's body.
      */
    private reposition(): void {
        const body = this.owner.body as Phaser.Physics.Arcade.Body | null
        const { width, height, offsetX, offsetY } = this.config

        const centerX = body ? body.center.x : this.owner.x
        const centerY = body ? body.center.y : this.owner.y
        const halfWidth = body ? body.halfWidth : 0

        // the near edge of the swing, then grow away from the owner
        const near = centerX + this.facing * (halfWidth + offsetX)

        this.area.setTo(
            this.facing > 0 ? near : near - width,
            centerY + offsetY - height / 2,
            width,
            height,
        )
    }

    /**
     * Rides along with arcade's own debug draw, so the reach is visible in exactly
     * the builds that are already showing hitboxes
     */
    private drawDebug(): void {
        if (!this.owner.scene?.physics.world.drawDebug) return

        // above the owner and its equipment overlay, so the outline isn't buried
        this.debug ??= this.owner.scene.add.graphics().setDepth(this.owner.depth + 2)

        this.debug.clear()
        if (!this.isWindowOpen) return

        this.debug.lineStyle(1, DEBUG_COLOR, 1).strokeRectShape(this.area)
    }
}
