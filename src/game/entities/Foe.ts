import * as Phaser from 'phaser';

import { AnimationController } from "../components/AnimationController"
import { HealthChange, HealthComponent, HealthEvent } from "../components/HealthComponent"
import { FoeAnims, FoeDefinition } from '../utils/constants';
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
 * than a subclass.
 */
export default class Foe extends Phaser.Physics.Arcade.Sprite {
    private animations: AnimationController<FoeAnims>
    private stateMachine: StateMachine<Foe>
    private health: HealthComponent

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

        const { width, height, offsetX, offsetY } = definition.body
        this.setSize(width, height)
        this.setOffset(offsetX, offsetY)

        this.animations = new AnimationController<FoeAnims>(this, definition.anims, {
            texture: definition.texture,
            facing: definition.facing,
        })

        // no busPrefix - nothing outside this entity draws a foe's health, so its
        // events stay local rather than adding noise to the global bus
        this.health = new HealthComponent(definition.health)

        this.stateMachine = new StateMachine<Foe>(this)
            .addStates(...createFoeStates())
            .start(FoeState.Idle)

        this.bindHealth()

        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this)
    }

    update(_time: number, delta: number): void {
        if (!this.active) return

        this.health.update(delta)
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
        this.direction = direction
        this.setVelocityX(direction * speed)
        this.animations.setFacing(direction)
    }

    turnAround(): void {
        this.direction = this.direction === 1 ? -1 : 1
        this.animations.setFacing(this.direction)
    }

    // stop dead and fade out, then remove itself - there's no death animation on
    // the sheet, so the fade is what sells it
    collapse(): void {
        this.setVelocity(0, 0)
        this.setAccelerationX(0)

        // stops colliding immediately, so a corpse can't keep dealing contact damage
        const body = this.body as Phaser.Physics.Arcade.Body
        body.enable = false

        this.scene.tweens.add({
            targets: this,
            alpha: 0,
            duration: this.definition.deathFadeMs,
            ease: "Quad.easeIn",
            onComplete: () => this.destroy(),
        })
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

    destroy(fromScene?: boolean): void {
        this.stateMachine?.destroy()
        this.animations?.destroy()
        this.health?.destroy()
        super.destroy(fromScene)
    }
}
