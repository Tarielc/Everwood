import * as Phaser from 'phaser';

import { AnimationController } from "../components/AnimationController"
import { AttackComponent } from "../components/attack/AttackComponent"
import { RangedAttack } from "../components/attack/RangedAttack"
import { HealthChange, HealthComponent, HealthEvent } from "../components/HealthComponent"
import { FoeAnims } from '../data/animations';
import { FoeDefinition } from '../data/foes';
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

/** flash color when foe takes damage */
const DAMAGE_FLASH_COLOR = 0xffffff
/** ms of each flash */
const DAMAGE_FLASH_MS = 60

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
        super(scene, x, y, definition.texture)

        scene.add.existing(this)
        scene.physics.add.existing(this)

        this.homeX = x

        this.setScale(definition.scale)
        this.setCollideWorldBounds(true)
        this.setSize(definition.body.width, definition.body.height)

        this.animations = new AnimationController<FoeAnims>(this, definition.anims, {
            texture: definition.texture,
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

        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this)
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
    }

    /** However the attack ended this shuts it down and starts the cooldown. */
    endAttack(): void {
        this.attack?.end()
    }

    /** `true` if foe can start its attack right now - whether the target is in range, is the state machine'sbusiness */
    get isAttackReady(): boolean {
        return !this.health.isDead && this.attack?.isReady === true
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
     * Subscribe to health events
     * 
     * - `Damaged`: flash sprite and knockback enemy. if not fatal, transition to hurt state.
     * - `Died`: transition to death state, which calls `collapse()`.
     */
    private bindHealth(): void {
        this.health.on(HealthEvent.Damaged, (change: HealthChange) => {
            this.flashDamage()
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
     * Knock foe back, away from the source.
     * 
     * @param source - source of knocback to derive a knockback direction
     * @returns 
     */
    private knockbackFrom(source: unknown): void {
        const from = source as Partial<FoeTarget> | undefined
        if (typeof from?.x !== 'number') return

        const away = from.x < this.x ? 1 : -1
        this.setVelocityX(away * this.definition.knockback)
        this.setVelocityY(this.definition.knockbackLift)
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

    return attack.kind === "melee"
        ? new MeleeAttack(owner, attack.swing)
        : new RangedAttack(owner, attack)
}
