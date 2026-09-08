import * as Phaser from 'phaser';
import { MeleeAttackConfig } from '../utils/constants';

export const CombatEvent = {
    SwingStarted: "combat-swing-started",
    SwingEnded: "combat-swing-ended",
    Hit: "combat-hit",
} as const

export type CombatEventName = typeof CombatEvent[keyof typeof CombatEvent]

// anything a swing can connect with - the component only needs to tell two of
// them apart, the scene decides what actually counts as a target
export interface Attackable extends Phaser.GameObjects.GameObject {
    x: number
    y: number
}

// outline colour of the hit area while arcade's debug draw is on
const DEBUG_COLOR = 0xff3355

/**
 * A melee swing: its timing, its reach, and the bookkeeping that stops one swing
 * from hitting the same target twice.
 *
 * It owns no physics body. The hit area is a plain rectangle that only exists
 * during the active window, so the component never has to know what a foe is -
 * the scene tests the rectangle against whatever it considers hittable, and a
 * foe could use the same component to swing back.
 */
export class CombatComponent extends Phaser.Events.EventEmitter {
    // ms into the current swing, -1 while there isn't one
    private elapsed: number = -1
    // ms until the next swing is allowed to start
    private cooldown: number = 0
    // what's left of a queued press - a press slightly too early still lands
    private buffer: number = 0

    // locked in when the swing starts, so turning around mid-animation can't
    // drag the hitbox across to the other side
    private swingFacing: -1 | 1 = 1

    // everything this swing has already connected with
    private connected: Set<Attackable> = new Set()

    // reused - a swing shouldn't allocate a rectangle every frame
    private readonly area: Phaser.Geom.Rectangle = new Phaser.Geom.Rectangle()

    private debug: Phaser.GameObjects.Graphics | null = null

    constructor(
        private owner: Phaser.Physics.Arcade.Sprite,
        private config: MeleeAttackConfig,
    ) {
        super()
    }

    // remember a press - the swing itself starts when the owner decides it may
    queue(): void {
        this.buffer = this.config.bufferMs
    }

    // begin the swing, pointed the way the owner is facing right now
    start(facing: -1 | 1): void {
        this.buffer = 0
        this.elapsed = 0
        this.swingFacing = facing
        this.connected.clear()

        // land on this frame's reach immediately, rather than a frame behind
        this.reposition()
        this.emit(CombatEvent.SwingStarted)
    }

    // however the swing ended - played out, interrupted by a flinch, or cut short
    // by death - this closes the hit area and starts the cooldown
    end(): void {
        if (this.elapsed < 0) return

        this.elapsed = -1
        this.cooldown = this.config.cooldownMs
        this.connected.clear()
        this.emit(CombatEvent.SwingEnded)
    }

    update(dt: number): void {
        if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt)
        if (this.buffer > 0) this.buffer = Math.max(0, this.buffer - dt)

        if (this.elapsed >= 0) {
            this.elapsed += dt
            // make sure attack box is repositioned, so it'd always in front of a sprite, not somwhere middle
            // usefuleness of this line is depicted well if we clear platnFeet() function of a player
            this.reposition()
        }

        this.drawDebug()
    }

    // true the first time this swing reaches `target` - the caller deals the
    // damage, so what a hit costs stays with whoever knows about damage
    registerHit(target: Attackable): boolean {
        if (!this.isWindowOpen || this.connected.has(target)) return false

        this.connected.add(target)
        this.emit(CombatEvent.Hit, target)
        return true
    }

    // a press waiting on a swing that's allowed to start
    get canSwing(): boolean {
        return this.buffer > 0 && this.cooldown <= 0 && this.elapsed < 0
    }

    get isSwinging(): boolean {
        return this.elapsed >= 0
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
        this.removeAllListeners()
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
        const near = centerX + this.swingFacing * (halfWidth + offsetX)

        this.area.setTo(
            this.swingFacing > 0 ? near : near - width,
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
