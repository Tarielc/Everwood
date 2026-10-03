import * as Phaser from 'phaser';

import { AnimationController } from "../components/AnimationController"
import { AttackComponent } from "../components/attack/AttackComponent"
import { RangedAttack } from "../components/attack/RangedAttack"
import { HealthChange, HealthComponent, HealthEvent } from "../components/HealthComponent"
import { FoeAnims } from '../data/animations';
import { FoeDefinition, HitEffects } from '../data/foes';
import { ATLAS, atlasFrame } from '../config/atlas';
import { StateMachine } from '../systems/state/StateMachine';
import { createFoeStates, FoeState } from '../systems/state/FoeStates';
import { MeleeAttack } from '../components/attack/MeleeAttack';
import { AttackEvent } from '../components/attack/AttackComponent';
import { AudioController } from '../systems/audio/AudioController';

/** Anything a foe can chase and bump into - it only ever needs a position */
export interface FoeTarget extends Phaser.GameObjects.GameObject {
    x: number
    y: number
}

/** Whatever hit the foe - how hard it shoves comes from what it swung, not from the foe */
interface KnockbackSource {
    x: number
    attackKnockback: number
    attackKnockbackLift: number
}

/** What a foe asks of the scene - it can't bring anything into the world itself */
export const FoeEvent = {
    /** `(foeId: string, x: number, y: number)` - spawn one of these, there, as this foe's minion */
    Summon: "foe-summon",
} as const

/** flash color when foe takes damage */
const DAMAGE_FLASH_COLOR = 0xffffff
/** ms of each flash */
const DAMAGE_FLASH_MS = 60

/** How long a blast hurts for once the fuse runs out - a few frames, so it can't be missed */
const BLAST_ACTIVE_MS = 60
/** ms of each blink while a fuse burns */
const FUSE_BLINK_MS = 70

/** How long a flier keeps going round something once it's clear of it - long enough to carry its body past the edge */
const DETOUR_CLEAR_MS = 250
/** How hard a flier keeps leaning into what it's going round, as a share of its speed - it's what tells it the thing is still there */
const DETOUR_LEAN = 0.3

/**
 * Config-driven enemy.
 * 
 * A config-driven enemy. Everything that varies between foes lives in its
 * FoeDefinition, so a new one is a constants entry and a spritesheet rather
 * than a subclass - including how it fights, which is a swing for some, a bow
 * for others, and nothing at all for the ones that only walk into you.
 * 
 * {@link AnimationController}
 * {@link StateMachine}
 * {@link HealthComponent}
 * {@link AttackComponent} (optional)
 * 
 * Finding a target is left to the scene.
 */
export default class Foe extends Phaser.Physics.Arcade.Sprite {
    /** foe animations and mirrors sprite's facing direction */
    private animations: AnimationController<FoeAnims>
    /** behavior states and transition between them  */
    private stateMachine: StateMachine<Foe>
    /** hitpoints, regenration, etc - broacasting on global event bus */
    private health: HealthComponent

    /**
     * attack components which is either melee swing,
     * ranged attack, or null for foes that walk into you.
    */
    private attack: AttackComponent | null = null

    /** where a foe spawned - patrol is measured from here */
    readonly homeX: number

    /** direction a foe is facing */
    private direction: -1 | 1 = 1
    /** target of foe - usually player */
    private chaseTarget: FoeTarget | null = null

    /**
     * A flier going round something in its way rather than into it - the axis it
     * slides along, which way, and until when. `null` while it flies straight
     */
    private detour: { axis: 'x' | 'y', direction: -1 | 1, until: number } | null = null

    /** the blink while a fuse burns, `null` when there's no fuse lit */
    private fuseBlink: Phaser.Tweens.Tween | null = null

    /** time spent fighting since the last call for help - only counts for a foe that summons */
    private summonElapsed = 0
    /** what it has summoned that is still up - checked against `summon.maxAlive` */
    private minions: Set<Foe> = new Set()

    /**
     * Adds foe sprite to the scene and physics body to the world,
     * sets worldcollider bounds, initializes all the class variables
     * and creates components based on foe defition.
     * 
     * @param scene - Scene to spawn foe in
     * @param x - spawn X coordinate (world)
     * @param y - spawn Y coordinate (world)
     * @param definition - foe definition - which foe type to spawn
     */
    constructor(
        scene: Phaser.Scene,
        x: number,
        y: number,
        readonly definition: FoeDefinition,
    ) {
        super(scene, x, y, ATLAS, atlasFrame(definition.anims.idle.prefix, definition.anims.idle.start))

        scene.add.existing(this)
        scene.physics.add.existing(this)

        this.homeX = x

        this.setScale(definition.scale)
        this.setCollideWorldBounds(true)
        this.setSize(definition.body.width, definition.body.height)

        // a flier holds its height by itself - nothing pulls it down between states
        if (definition.flying) (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(false)

        this.animations = new AnimationController<FoeAnims>(this, definition.anims, {
            facing: definition.facing,
        })

        // start out pointed the way its sheet is drawn - a foe drawn facing left
        // shouldn't spend its first patrol leg walking backwards. this also lands
        // the body offset, which is why it runs instead of a bare setOffset()
        this.setFacing(this.animations.facing)

        // no busPrefix - nothing outside this entity draws a foe's health, so its
        // events stay local rather than adding noise to the global bus
        this.health = new HealthComponent(definition.health)

        this.attack = createAttack(this, definition)

        this.stateMachine = new StateMachine<Foe>(this)
            .addStates(...createFoeStates())
            .start(FoeState.Idle)

        this.bindHealth()
        this.bindAudio()
    }

    /**
     * Runs every frame, called from `GameScene.update()`
     * 
     * Order matters: health and attack ticj before statemachine, so states see
     * this frame's i-frames and cooldowns.
     * 
     * @param delta - Time elapsed since the previous frame (16.67 for 60FPS)
     */
    update(delta: number): void {
        if (!this.active) return

        this.health.update(delta)

        // ticks whether or not the foe is mid-attack - a cooldown that only ran
        // during the attack would never finish counting down
        this.attack?.update(delta)

        this.stateMachine.update(delta)

        this.tickSummon(delta)
    }

    /**
     * Count a summoned foe against this one's cap, until it goes down.
     *
     * The scene calls this once it has spawned what a {@link FoeEvent.Summon} asked for
     *
     * @param minion - foe brought in on this one's call
     */
    addMinion(minion: Foe): void {
        this.minions.add(minion)

        const release = () => this.minions.delete(minion)
        // on death rather than when the corpse finishes fading, so the next call has room sooner
        minion.getHealth.once(HealthEvent.Died, release)
        minion.once(Phaser.GameObjects.Events.DESTROY, release)
    }

    /**
     * Set who the foe hunts.
     * 
     * It is handed by the scene, because foe doesn't know how to find one.
     * 
     * @param target - who a foe hunts, `null` to if none
     * @returns this foe object to allow chaining
     */
    setTarget(target: FoeTarget | null): this {
        this.chaseTarget = target
        return this
    }

    /**
     * Take a hit/damage.
     * 
     * @param amount - amount of damage to take
     * @param source - source of the damage
     * @returns `true` if foe took damage, `false` otherwise.
     */
    takeDamage(amount: number, source?: unknown): boolean {
        return this.health.damage(amount, source)
    }

    /**
     * Faces and moves the foe horizontally
     * 
     * @param direction - which direction to walk: `-1` left, `1` right
     * @param speed - Horizontal speed to walk
     */
    walk(direction: -1 | 1, speed: number): void {
        this.setFacing(direction)
        this.setVelocityX(direction * speed)
    }

    /**
     * Fly straight at the target's middle - a flier's chase, in place of `walk()`.
     *
     * @param speed - speed along the line to the target
     */
    flyTowardTarget(speed: number): void {
        const target = this.chaseTarget
        if (!target) return

        const center = targetCenter(target)
        const x = center.x
        // aim over the target rather than into it, by however high this one hovers
        const y = center.y - (this.definition.hoverHeight ?? 0)

        if (this.steerAround(x - this.x, y - this.y, speed)) return

        const angle = Phaser.Math.Angle.Between(this.x, this.y, x, y)

        this.setFacing(x < this.x ? -1 : 1)
        this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed)
    }

    /**
     * Go round whatever is between a flier and its target. Straight at the target
     * leaves it pressed flat under a platform the target stands on, going nowhere -
     * so once it's blocked on the way, it slides along the surface instead, still
     * leaning into it, until it's past the edge.
     *
     * The way round is picked once and kept until it's clear. Re-picking toward the
     * target every frame would turn it back the moment it passed under them.
     *
     * @param dx - horizontal distance to where it's flying
     * @param dy - vertical distance to where it's flying
     * @param speed - speed to go round at
     * @returns `true` if it's going round something this frame
     */
    private steerAround(dx: number, dy: number, speed: number): boolean {
        const body = this.body as Phaser.Physics.Arcade.Body
        const now = this.scene.time.now

        // a ceiling or floor in the way - along it, toward the target's side to start with
        if ((dy < 0 && body.blocked.up) || (dy > 0 && body.blocked.down)) {
            const direction = this.detour?.axis === 'x' ? this.detour.direction : (dx < 0 ? -1 : 1)
            this.detour = { axis: 'x', direction, until: now + DETOUR_CLEAR_MS }
        }
        // a wall in the way - up and over it unless the target is below
        else if ((dx < 0 && body.blocked.left) || (dx > 0 && body.blocked.right)) {
            const direction = this.detour?.axis === 'y' ? this.detour.direction : (dy > 0 ? 1 : -1)
            this.detour = { axis: 'y', direction, until: now + DETOUR_CLEAR_MS }
        }

        if (this.detour && now >= this.detour.until) this.detour = null
        if (!this.detour) return false

        const { axis, direction } = this.detour
        const lean = speed * DETOUR_LEAN

        if (axis === 'x') {
            this.setFacing(direction)
            this.setVelocity(direction * speed, Math.sign(dy) * lean)
        } else {
            this.setFacing(dx < 0 ? -1 : 1)
            this.setVelocity(Math.sign(dx) * lean, direction * speed)
        }
        return true
    }

    /** Stop moving - both axes for a flier, which nothing else would stop */
    halt(): void {
        this.setVelocityX(0)
        if (this.definition.flying) this.setVelocityY(0)
    }

    /** turn the foe around - flip facing direction */
    turnAround(): void {
        this.setFacing(this.direction === 1 ? -1 : 1)
    }

    /** turn towards target, so a swing or a shot leaves on the right side */
    faceTarget(): void {
        if (!this.chaseTarget) return
        this.setFacing(this.chaseTarget.x < this.x ? -1 : 1)
    }

    /**
     * Begin whatever this foe's attack is -
     * the state owns when, the component owns what.
     * 
     * The facing is locked in here, so being knocked round
     * halfway through can't drag the reach across with it.
     */
    beginAttack(): void {
        if (!this.attack) return

        this.faceTarget()
        this.attack.start(this.animations.facing)

        // a lit fuse blinks, so there's something to see and get away from
        if (this.selfDestructs) {
            this.fuseBlink = this.scene.tweens.add({
                targets: this,
                alpha: 0.35,
                duration: FUSE_BLINK_MS,
                yoyo: true,
                repeat: -1,
            })
        }
    }

    /** However the attack ended this shuts it down and starts the cooldown. */
    endAttack(): void {
        this.attack?.end()

        this.fuseBlink?.remove()
        this.fuseBlink = null
        this.setAlpha(1)
    }

    /** `true` for a foe whose attack is blowing itself up */
    get selfDestructs(): boolean {
        return this.definition.attack?.kind === "explode"
    }

    /**
     * Die in the blast it just set off - the death animation is the explosion.
     * Called once the blast's hit window has run, so the damage has already landed.
     */
    detonate(): void {
        this.health.kill(this)
    }

    /** `true` if foe can start its attack right now - whether the target is in range, is the state machine'sbusiness */
    get isAttackReady(): boolean {
        return !this.health.isDead && this.attack?.isReady === true
    }

    /** `true` if foe is standing on something - the ground, or another body */
    get isGrounded(): boolean {
        const body = this.body as Phaser.Physics.Arcade.Body
        return body.blocked.down || body.touching.down
    }

    /** `true` if foe is currently attacking */
    get isAttacking(): boolean {
        return this.attack?.isAttacking === true
    }

    /** how long an attack takes - with no animation to lock, this is all there is to time the state against */
    get attackDurationMs(): number {
        return this.attack?.durationMs ?? 0
    }

    /** whjat one of its attacks damage is - 0 for a foe that doesn't got one */
    get attackDamage(): number {
        return this.definition.attack?.damage ?? 0
    }

    /**
     * Roll this foe's attack effects - knockback and stun each get their own roll.
     *
     * @returns the effects to apply - each `null` when the attack has none or the roll missed
     */
    rollHitEffects(): HitEffects {
        const attack = this.definition.attack
        const knockback = attack?.knockback
        const stun = attack?.stun

        return {
            knockback: knockback && Math.random() < knockback.chance ? knockback : null,
            stunMs: stun && Math.random() < stun.chance ? stun.durationMs : null,
        }
    }

    /** how much room it wants between itself and its target - `0` for anything that's happy to close all the way in */
    get standoffRange(): number {
        const attack = this.definition.attack
        return attack?.kind === "ranged" ? attack.standoff : 0
    }

    /**
     * Stops dead, falls over, and removes iself.
     * 
     * A sheet with a death animation plays is out first,
     * the rest have only the fade to sell it 
     */
    collapse(): void {
        this.setVelocity(0, 0)
        this.setAccelerationX(0)

        // stops colliding immediately, so a corpse can't keep dealing contact damage
        const body = this.body as Phaser.Physics.Arcade.Body
        body.enable = false

        if (this.animations.has("death")) {
            // forced, because the flinch it just took is almost certainly still locked
            this.animations.play("death", {
                restart: true,
                force: true,
                onComplete: () => this.fadeOut(),
            })
            return
        }

        this.animations.stop()
        this.fadeOut()
    }

    /** target the foe chases, `null` if foe has no target */
    get target(): FoeTarget | null {
        return this.chaseTarget
    }

    /** patrol direction of a foe */
    get patrolDirection(): -1 | 1 {
        return this.direction
    }

    /** foe contact damage - `0` for anything that doesn't have contact damage  */
    get contactDamage(): number {
        return this.definition.contactDamage
    }

    /** `true` if foe is dead, `false` otherwise */
    get isDead(): boolean {
        return this.health.isDead
    }

    /** statemachine component of this foe */
    get states(): StateMachine<Foe> {
        return this.stateMachine
    }

    /** animation controller of this foe */
    get getAnimations(): AnimationController<FoeAnims> {
        return this.animations
    }

    /** health component of this foe */
    get getHealth(): HealthComponent {
        return this.health
    }

    /** meele attack component if foe has one, `null` otherwise */
    get meleeAttack(): MeleeAttack | null {
        return this.attack instanceof MeleeAttack ? this.attack : null
    }

    /** ranged attack component if foe has one, `null` otherwise */
    get rangedAttack(): RangedAttack | null {
        return this.attack instanceof RangedAttack ? this.attack : null
    }

    /**
     * Run down the summon timer, and call for help when it's up and there's room.
     *
     * Only while it's fighting - a boss nobody has found yet doesn't fill the room.
     * The foe doesn't know how to spawn anything, so it asks the scene
     *
     * @param delta - Time elapsed since the previous frame
     * @fires FoeEvent.Summon with the foe id and the world x, y to bring each one in at
     */
    private tickSummon(delta: number): void {
        const summon = this.definition.summon
        if (!summon || this.isDead) return

        const fighting = this.stateMachine.isCurrentState(FoeState.Chase)
            || this.stateMachine.isCurrentState(FoeState.Attack)
            || this.stateMachine.isCurrentState(FoeState.Hurt)
        if (!fighting) return

        this.summonElapsed += delta
        if (this.summonElapsed < summon.intervalMs) return
        this.summonElapsed = 0

        const room = Math.min(summon.count, summon.maxAlive - this.minions.size)
        for (let i = 0; i < room; i++) {
            const x = this.x + Phaser.Math.Between(-summon.spread, summon.spread)
            this.emit(FoeEvent.Summon, summon.foe, x, this.y)
        }
    }

    /**
     * Subscribe to health events
     * 
     * - `Damaged`: flash sprite and knockback enemy. if not fatal, transition to hurt state.
     * - `Died`: transition to death state, which calls `collapse()`.
     */
    private bindHealth(): void {
        this.health.on(HealthEvent.Damaged, (change: HealthChange) => {
            this.flashDamage()

            // a boss shrugs off hits while it attacks - otherwise every cut cancels
            // the swing, and it can be held in a flinch until it dies
            if (this.definition.boss && this.stateMachine.isCurrentState(FoeState.Attack)) return

            this.knockbackFrom(change.source)

            // Died fires straight after and owns the collapse
            if (change.current > 0) this.stateMachine.transition(FoeState.Hurt)
        })

        this.health.on(HealthEvent.Died, () => {
            this.stateMachine.transition(FoeState.Dead)
        })
    }

    /**
     * Give the foe a voice, from the `sounds` its definition names - each one optional,
     * so a foe with nothing to say makes no noise.
     *
     * Everything here is played at the foe rather than flat, so what is happening across
     * the arena is heard from across the arena. The listeners hang off the components and
     * the health, which are destroyed with the foe, so they leave when it does
     */
    private bindAudio(): void {
        const sounds = this.definition.sounds
        if (!sounds) return

        const audio = AudioController.instance

        // as it commits - the swing leaving, or the bow being drawn
        if (sounds.attack) {
            this.attack?.on(AttackEvent.Started, () => audio.playAt(sounds.attack!, this.x, this.y))
        }

        // the moment the shot itself leaves, which is a beat later
        if (sounds.shoot) {
            this.attack?.on(AttackEvent.Shot, () => audio.playAt(sounds.shoot!, this.x, this.y))
        }

        if (sounds.hurt) {
            this.health.on(HealthEvent.Damaged, () => audio.playAt(sounds.hurt!, this.x, this.y))
        }

        if (sounds.death) {
            this.health.on(HealthEvent.Died, () => audio.playAt(sounds.death!, this.x, this.y))
        }
    }

    /**
     * FlipX sprite and body in a direction
     * 
     * @param direction - Direction of the facing 
     */
    private setFacing(direction: -1 | 1): void {
        this.direction = direction
        this.animations.setFacing(direction)
        this.applyBodyOffset()
    }

    /**
     * Physics body isn't symmetrical to spritesheet,
     * so when sprite is mirrored, we also need to mirror physics body.
     */
    private applyBodyOffset(): void {
        const { width, offsetX, offsetY } = this.definition.body
        const mirrored = this.definition.frame.frameWidth - offsetX - width

        this.setOffset(this.flipX ? mirrored : offsetX, offsetY)
    }

    /**
     * Knock foe back, away from the source, as hard as the source hits.
     *
     * @param source - source of knocback to derive a knockback direction and force
     * @returns
     */
    private knockbackFrom(source: unknown): void {
        const from = source as Partial<KnockbackSource> | undefined
        if (typeof from?.x !== 'number') return
        if (typeof from.attackKnockback !== 'number') return

        const away = from.x < this.x ? 1 : -1
        this.setVelocityX(away * from.attackKnockback)
        this.setVelocityY(from.attackKnockbackLift ?? 0)
    }

    /** flash tint on damage */
    private flashDamage(): void {
        this.setTint(DAMAGE_FLASH_COLOR).setTintMode(Phaser.TintModes.FILL)
        this.scene.time.delayedCall(DAMAGE_FLASH_MS, () => {
            if (this.active) this.clearTint().setTintMode(Phaser.TintModes.MULTIPLY)
        })
    }

    /** fade and remove the enemy - whether or not animation played before */
    private fadeOut(): void {
        if (!this.active) return

        this.scene.tweens.add({
            targets: this,
            alpha: 0,
            duration: this.definition.deathFadeMs,
            ease: "Quad.easeIn",
            onComplete: () => this.destroy(),
        })
    }

    /** destructor and cleanup */
    destroy(fromScene?: boolean): void {
        this.fuseBlink?.remove()
        this.stateMachine?.destroy()
        this.animations?.destroy()
        this.health?.destroy()
        this.attack?.destroy()
        super.destroy(fromScene)
    }
}

/**
 * Turns a definitions's attack into a component - the only place
 * its `king` is checked. Everything downsstream ever sees only {@link AttackComponent}
 * 
 * @param owner - foe that owns the attack component
 * @param definition - definition of the owner foe
 * @returns ! {@link MeleeAttack} for king `melee`, a {@link RangedAttack} for king `ranged`,
 *  or `null` if the definition has no attack component.
 */
function createAttack(owner: Foe, definition: FoeDefinition): AttackComponent | null {
    const attack = definition.attack
    if (!attack) return null

    switch (attack.kind) {
        case "melee":
            return new MeleeAttack(owner, attack.swing)
        case "ranged":
            return new RangedAttack(owner, attack)
        case "explode":
            // a swing that doesn't reach out - it sits on the foe, and its windup is the
            // fuse. being a MeleeAttack is what gets it resolved against the player
            return new MeleeAttack(owner, {
                windupMs: attack.fuseMs,
                activeMs: BLAST_ACTIVE_MS,
                cooldownMs: 0,
                bufferMs: 0,
                width: attack.radius * 2,
                height: attack.radius * 2,
                offsetX: 0,
                offsetY: 0,
                centered: true,
            })
    }
}

/**
 * The middle of a target's body, or its position if it has none - a flier aims
 * here, rather than at a sprite origin that may sit off the body
 *
 * @param target - what's being chased
 * @returns world point to fly at
 */
export function targetCenter(target: FoeTarget): { x: number, y: number } {
    const body = target.body as Phaser.Physics.Arcade.Body | null
    return body ? body.center : target
}
