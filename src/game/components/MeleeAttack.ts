import * as Phaser from 'phaser';
import { AttackComponent, AttackEvent } from './AttackComponent';

/** A swing's timing and reach, the same shape whoever holds the weapon */
export interface MeleeAttackConfig {
    /** How far into the swing the hit area opens - the rest of the animation is windup and recovery, and hurts nobody */
    windupMs: number,
    /** How long the hit area stays open */
    activeMs: number,
    /** Enforced after the swing ends, so a held button isn't a blender */
    cooldownMs: number,
    /** A press this far ahead of the swing being allowed still counts, so mashing flows into the next swing */
    bufferMs: number,
    /** The hit area in world pixels, measured out from the edge of the attacker's body - not scaled with the sprite */
    width: number,
    height: number,
    offsetX: number,
    /** Negative reaches above the attacker's middle */
    offsetY: number,
}

// anything a swing can connect with - the component only needs to tell two of
// them apart, the scene decides what actually counts as a target
export interface Attackable extends Phaser.GameObjects.GameObject {
    x: number
    y: number
}

// outline colour of the hit area while arcade's debug draw is on
const DEBUG_COLOR = 0xff3355

/**
 * A melee swing: its reach, and the bookkeeping that stops one swing from
 * hitting the same target twice. Its timing comes from AttackComponent.
 *
 * It owns no physics body. The hit area is a plain rectangle that only exists
 * during the active window, so the component never has to know what a foe is -
 * the scene tests the rectangle against whatever it considers hittable, which
 * is how the player and the warrior both swing with this same class.
 */
export class MeleeAttack extends AttackComponent {
    // everything this swing has already connected with
    private connected: Set<Attackable> = new Set()

    // reused - a swing shouldn't allocate a rectangle every frame
    private readonly area: Phaser.Geom.Rectangle = new Phaser.Geom.Rectangle()

    private debug: Phaser.GameObjects.Graphics | null = null

    constructor(
        owner: Phaser.Physics.Arcade.Sprite,
        private config: MeleeAttackConfig,
    ) {
        super(owner)
    }

    get durationMs(): number {
        return this.config.windupMs + this.config.activeMs
    }

    protected get cooldownMs(): number {
        return this.config.cooldownMs
    }

    protected get bufferMs(): number {
        return this.config.bufferMs
    }

    update(dt: number): void {
        super.update(dt)

        // outside the base's "only while attacking" tick, so the outline is
        // cleared on the frame the window shuts instead of being left on screen
        this.drawDebug()
    }

    // true the first time this swing reaches `target` - the caller deals the
    // damage, so what a hit costs stays with whoever knows about damage
    registerHit(target: Attackable): boolean {
        if (!this.isWindowOpen || this.connected.has(target)) return false

        this.connected.add(target)
        this.emit(AttackEvent.Hit, target)
        return true
    }

    // the frames that actually hurt, between the windup and the recovery
    get isWindowOpen(): boolean {
        const { windupMs, activeMs } = this.config
        return this.elapsed >= windupMs && this.elapsed < windupMs + activeMs
    }

    // null while the swing is winding up, recovering, or not happening at all -
    // so a caller that has a rectangle knows it's live
    get hitArea(): Phaser.Geom.Rectangle | null {
        return this.isWindowOpen ? this.area : null
    }

    destroy(): void {
        this.debug?.destroy()
        this.debug = null
        this.connected.clear()
        super.destroy()
    }

    protected onStart(): void {
        this.connected.clear()
        // land on this frame's reach immediately, rather than a frame behind
        this.reposition()
    }

    protected onEnd(): void {
        this.connected.clear()
    }

    protected advance(_dt: number): void {
        // make sure attack box is repositioned, so it'd always in front of a sprite, not somwhere middle
        // usefuleness of this line is depicted well if we clear platnFeet() function of a player
        this.reposition()
    }

    // park the hit area in front of the owner, measured from the edge of its
    // body rather than its centre, so a wider character reaches from its shoulder
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

    // rides along with arcade's own debug draw, so the reach is visible in exactly
    // the builds that are already showing hitboxes
    private drawDebug(): void {
        if (!this.owner.scene?.physics.world.drawDebug) return

        // above the owner and its equipment overlay, so the outline isn't buried
        this.debug ??= this.owner.scene.add.graphics().setDepth(this.owner.depth + 2)

        this.debug.clear()
        if (!this.isWindowOpen) return

        this.debug.lineStyle(1, DEBUG_COLOR, 1).strokeRectShape(this.area)
    }
}
