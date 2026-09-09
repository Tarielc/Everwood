import * as Phaser from 'phaser';
import { FOES, FoeDefinition, ItemId, PLAYER_HEALTH_BUS, SCALE_FACTOR } from '../utils/constants';
import Foe from '../entities/Foe';
import Player from '../entities/Player';
import Projectile from '../entities/Projectile';
import InputController from '../systems/inputs/InputController';
import { AttackEvent } from '../components/AttackComponent';
import { Shot } from '../components/RangedAttack';
import { HealthEvent } from '../components/HealthComponent';

// where the player spawns and respawns
const SPAWN = { x: 400, y: 300 }

// where each foe starts its patrol - the archer is parked out to the right, far
// enough that it opens up on the player before anything else has closed in
const FOX_SPAWN = { x: 250, y: 300 }
const WARRIOR_SPAWN = { x: 800, y: 300 }
const ARCHER_SPAWN = { x: 1150, y: 300 }

// how long the player stays down before respawning
const RESPAWN_DELAY_MS = 2500

// what the player is holding when the level starts
const STARTING_ITEM: ItemId = "diamond-sword"

// number-row shortcuts for swapping gear, until there's an inventory UI
const ITEM_HOTKEYS: Record<string, ItemId | null> = {
    "keydown-ONE": "diamond-sword",
    "keydown-TWO": "diamond-axe",
    "keydown-THREE": "diamond-pickaxe",
    "keydown-ZERO": null, // bare hands
}

export default class GameScene extends Phaser.Scene {

    private player!: Player
    private controls!: InputController
    private foes: Foe[] = []
    private projectiles: Projectile[] = []

    // reused - resolving a swing shouldn't allocate a rectangle per foe per frame
    private readonly foeBounds: Phaser.Geom.Rectangle = new Phaser.Geom.Rectangle()
    private readonly playerBounds: Phaser.Geom.Rectangle = new Phaser.Geom.Rectangle()

    constructor() {
        super("GameScene")
    }

    create() {
        // create input controller after game starts
        this.controls = new InputController(this)

        // spawn player in game scene and give it input controls
        this.player = new Player(this, SPAWN.x, SPAWN.y, "player", this.controls)
            .setScale(SCALE_FACTOR)

        this.player.equip(STARTING_ITEM)
        this.bindItemHotkeys()

        this.spawnFoe(FOES.fox, FOX_SPAWN.x, FOX_SPAWN.y)
        this.spawnFoe(FOES.warrior, WARRIOR_SPAWN.x, WARRIOR_SPAWN.y)
        this.spawnFoe(FOES.archer, ARCHER_SPAWN.x, ARCHER_SPAWN.y)
        // listening on the component rather than the bus - it's torn down with the
        // player, so a scene restart can't leave a stale respawn timer behind
        this.player.getHealth.on(HealthEvent.Died, () => {
            this.time.delayedCall(RESPAWN_DELAY_MS, () => this.player.respawn(SPAWN.x, SPAWN.y))
        })

        // the HUD runs as its own scene - hand it the starting values so it draws
        // the right bar before the first health event arrives
        this.scene.launch("HealthBar", {
            ratio: this.player.getHealth.ratio,
            busPrefix: PLAYER_HEALTH_BUS,
        })

    }

    // bring a foe into the world and hook it up to the player
    private spawnFoe(definition: FoeDefinition, x: number, y: number): Foe {
        const foe = new Foe(this, x, y, definition).setTarget(this.player)
        this.foes.push(foe)

        // fires every frame of the overlap - takeDamage() ignores the hits that land
        // during i-frames, so contact damage paces itself
        this.physics.add.overlap(this.player, foe, () => {
            if (!foe.isDead) this.player.takeDamage(foe.contactDamage, foe)
        })

        // a bow only announces its shot - what one can hit is decided here, the
        // same as it is for a swing. this listens to the component rather than to
        // the foe, so a player bow would reuse it untouched
        foe.rangedAttack?.on(AttackEvent.Shot, (shot: Shot) => this.spawnProjectile(shot))

        // drop it from the update list once it has faded out and removed itself
        foe.once(Phaser.GameObjects.Events.DESTROY, () => {
            this.foes.splice(this.foes.indexOf(foe), 1)
        })

        return foe
    }

    // put a shot in the world and give it something to land on
    private spawnProjectile(shot: Shot): Projectile {
        const projectile = new Projectile(
            this, shot.x, shot.y, shot.projectile, shot.direction, shot.damage, shot.shooter,
        )
        this.projectiles.push(projectile)

        this.physics.add.overlap(this.player, projectile, () => {
            if (!projectile.active) return

            // spent either way - an arrow stopped by i-frames still stops
            this.player.takeDamage(projectile.damage, shot.shooter)
            projectile.strike()
        })

        projectile.once(Phaser.GameObjects.Events.DESTROY, () => {
            this.projectiles.splice(this.projectiles.indexOf(projectile), 1)
        })

        return projectile
    }

    // the swing's hit area is plain geometry, so this is where it's decided who
    // counts as a target. registerHit() is what stops one swing hitting twice
    private resolvePlayerSwing(): void {
        const swing = this.player.getAttack
        const area = swing.hitArea
        if (!area) return

        // backwards, so a foe that dies to the hit can't shift the ones behind it
        for (let i = this.foes.length - 1; i >= 0; i--) {
            const foe = this.foes[i]
            const body = foe.body as Phaser.Physics.Arcade.Body | null

            // a corpse mid-fade still has a sprite, but nothing left to hit
            if (foe.isDead || !body?.enable) continue

            this.foeBounds.setTo(body.x, body.y, body.width, body.height)
            if (!Phaser.Geom.Rectangle.Overlaps(area, this.foeBounds)) continue
            if (!swing.registerHit(foe)) continue

            // the player is the source, so the foe knows which way to be knocked
            foe.takeDamage(this.player.attackDamage, this.player)
        }
    }

    // the mirror of the above - a melee foe's swing reaches for the player, and
    // its own registerHit() keeps one swing to one hit
    private resolveFoeSwings(): void {
        const body = this.player.body as Phaser.Physics.Arcade.Body | null
        if (!body || this.player.getHealth.isDead) return

        this.playerBounds.setTo(body.x, body.y, body.width, body.height)

        for (const foe of this.foes) {
            const swing = foe.meleeAttack
            const area = swing?.hitArea
            if (!swing || !area) continue

            if (!Phaser.Geom.Rectangle.Overlaps(area, this.playerBounds)) continue
            if (!swing.registerHit(this.player)) continue

            // the foe is the source, so the player is knocked away from it
            this.player.takeDamage(foe.attackDamage, foe)
        }
    }

    // temporary stand-in for an inventory - swap gear with the number row
    private bindItemHotkeys(): void {
        const keyboard = this.input.keyboard
        if (!keyboard) return

        for (const [event, item] of Object.entries(ITEM_HOTKEYS)) {
            keyboard.on(event, () => {
                if (item) this.player.equip(item)
                else this.player.unequip()
            })
        }
    }

    update(time:number, delta:number){
        // sample input once per frame, before anything consumes it
        this.controls.update()

        // update player
        this.player.update(time, delta)

        // backwards, so a foe removing itself mid-loop can't skip the next one
        for (let i = this.foes.length - 1; i >= 0; i--) {
            this.foes[i].update(time, delta)
        }

        // same again - a shot that expires this frame drops out of the list
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            this.projectiles[i].update(time, delta)
        }

        // last, so every swing lands against where everything actually ended up
        this.resolvePlayerSwing()
        this.resolveFoeSwings()
    }
}
