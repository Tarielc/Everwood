import * as Phaser from 'phaser';

import { AnimationController } from "../components/AnimationController"
import { AttackComponent } from "../components/AttackComponent"
import { MeleeAttack } from "../components/MeleeAttack"
import { RangedAttack } from "../components/RangedAttack"
import { HealthChange, HealthComponent, HealthEvent } from "../components/HealthComponent"
import { FoeAnims } from '../data/animations';
import { FoeDefinition } from '../data/foes';
import { StateMachine } from '../systems/state/StateMachine';
import { createFoeStates, FoeState } from '../systems/state/FoeStates';

// anything the foe can chase and bump into - it only ever needs a position
export interface FoeTarget extends Phaser.GameObjects.GameObject {
    x: number
    y: number
}

// the white flash on the frame a hit lands, matching the player's
const DAMAGE_FLASH_COLOR = 0xffffff
const DAMAGE_FLASH_MS = 60

/**
 * A config-driven enemy. Everything that varies between foes lives in its
 * FoeDefinition, so a new one is a constants entry and a spritesheet rather
 * than a subclass - including how it fights, which is a swing for some, a bow
 * for others, and nothing at all for the ones that only walk into you.
 */
export default class Foe extends Phaser.Physics.Arcade.Sprite {
    private animations: AnimationController<FoeAnims>
    private stateMachine: StateMachine<Foe>
    private health: HealthComponent

    // how it fights, or null for a foe that only walks into you. its timing and
    // its cooldown are its own business - this class never asks which kind it is
    private attack: AttackComponent | null = null

    // where it spawned - patrol is measured from here, not from wherever it drifts to
    readonly homeX: number

    private direction: -1 | 1 = 1
    private chaseTarget: FoeTarget | null = null

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

        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this)
    }

    update(_time: number, delta: number): void {
        if (!this.active) return

        this.health.update(delta)

        // ticks whether or not the foe is mid-attack - a cooldown that only ran
        // during the attack would never finish counting down
        this.attack?.update(delta)

        this.stateMachine.update(delta)
    }

    // who it hunts - handed in by the scene, since the foe doesn't know how to find one
    setTarget(target: FoeTarget | null): this {
        this.chaseTarget = target
        return this
    }

    // take a hit - false means i-frames or death swallowed it
    takeDamage(amount: number, source?: unknown): boolean {
        return this.health.damage(amount, source)
    }

    // walk in `direction` at `speed`, facing the way it's going
    walk(direction: -1 | 1, speed: number): void {
        this.setFacing(direction)
        this.setVelocityX(direction * speed)
    }

    turnAround(): void {
        this.setFacing(this.direction === 1 ? -1 : 1)
    }

    // turn to whatever it's hunting, so a swing or a shot leaves on the right side
    faceTarget(): void {
        if (!this.chaseTarget) return
        this.setFacing(this.chaseTarget.x < this.x ? -1 : 1)
    }

    // begin whatever this foe's attack is - the state owns when, the component
    // owns what. the facing is locked in here, so being knocked round halfway
    // through can't drag the reach across with it
    beginAttack(): void {
        if (!this.attack) return

        this.faceTarget()
        this.attack.start(this.animations.facing)
    }

    // however the attack ended - played out, flinched out of, or cut short by
    // death - this shuts it down and starts the cooldown
    endAttack(): void {
        this.attack?.end()
    }

    // an attack this foe could start right now - whether the target is in range is
    // the state machine's business, this is only about cooldowns
    get isAttackReady(): boolean {
        return !this.health.isDead && this.attack?.isReady === true
    }

    get isAttacking(): boolean {
        return this.attack?.isAttacking === true
    }

    // how long an attack takes on a sheet that hasn't got one drawn on it - with
    // no animation to lock, this is all there is to time the state against
    get attackDurationMs(): number {
        return this.attack?.durationMs ?? 0
    }

    // what one of its attacks costs the player - 0 for a foe that hasn't got one
    get attackDamage(): number {
        return this.definition.attack?.damage ?? 0
    }

    // how much room it wants between itself and its target, 0 for anything happy
    // to close all the way in
    get standoffRange(): number {
        const attack = this.definition.attack
        return attack?.kind === "ranged" ? attack.standoff : 0
    }

    // stop dead and fall over, then remove itself - a sheet with a death animation
    // plays it out first, the rest have only the fade to sell it
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

    get target(): FoeTarget | null {
        return this.chaseTarget
    }

    get patrolDirection(): -1 | 1 {
        return this.direction
    }

    get contactDamage(): number {
        return this.definition.contactDamage
    }

    get isDead(): boolean {
        return this.health.isDead
    }

    get states(): StateMachine<Foe> {
        return this.stateMachine
    }

    get getAnimations(): AnimationController<FoeAnims> {
        return this.animations
    }

    get getHealth(): HealthComponent {
        return this.health
    }

    // the scene resolves melee reach and ranged shots itself, so it asks for the
    // component that actually has one - two narrowings, rather than every caller
    // re-deriving the kind from the definition
    get meleeAttack(): MeleeAttack | null {
        return this.attack instanceof MeleeAttack ? this.attack : null
    }

    get rangedAttack(): RangedAttack | null {
        return this.attack instanceof RangedAttack ? this.attack : null
    }

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

    // the one place facing changes, so the body offset can't drift out of step
    private setFacing(direction: -1 | 1): void {
        this.direction = direction
        this.animations.setFacing(direction)
        this.applyBodyOffset()
    }

    // a sheet's art doesn't have to sit in the middle of its frame, and flipping
    // mirrors the drawing without mirroring the body - so the offset is mirrored
    // by hand, which keeps the hitbox on the character instead of beside it
    private applyBodyOffset(): void {
        const { width, offsetX, offsetY } = this.definition.body
        const mirrored = this.definition.frame.frameWidth - offsetX - width

        this.setOffset(this.flipX ? mirrored : offsetX, offsetY)
    }

    // shove away from whatever hit it, when that thing has a position to shove from
    private knockbackFrom(source: unknown): void {
        const from = source as Partial<FoeTarget> | undefined
        if (typeof from?.x !== 'number') return

        const away = from.x < this.x ? 1 : -1
        this.setVelocityX(away * this.definition.knockback)
        this.setVelocityY(this.definition.knockbackLift)
    }

    private flashDamage(): void {
        this.setTint(DAMAGE_FLASH_COLOR).setTintMode(Phaser.TintModes.FILL)
        this.scene.time.delayedCall(DAMAGE_FLASH_MS, () => {
            if (this.active) this.clearTint().setTintMode(Phaser.TintModes.MULTIPLY)
        })
    }

    // the fade is what actually removes the foe, however it got here
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

    destroy(fromScene?: boolean): void {
        this.stateMachine?.destroy()
        this.animations?.destroy()
        this.health?.destroy()
        this.attack?.destroy()
        super.destroy(fromScene)
    }
}

// the single place a definition's attack kind is turned into a component -
// everything downstream of here only ever sees an AttackComponent
function createAttack(owner: Foe, definition: FoeDefinition): AttackComponent | null {
    const attack = definition.attack
    if (!attack) return null

    return attack.kind === "melee"
        ? new MeleeAttack(owner, attack.swing)
        : new RangedAttack(owner, attack)
}
