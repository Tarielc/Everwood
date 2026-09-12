import * as Phaser from 'phaser';
import {
    FOES,
    FoeDefinition,
    FoeId,
    ItemId,
    LEVELS,
    LevelId,
    MAP,
    MAP_CAMERA,
    PLAYER_HEALTH_BUS,
    SCALE_FACTOR,
    STARTING_LEVEL,
} from '../utils/constants';
import Foe from '../entities/Foe';
import Player from '../entities/Player';
import Projectile from '../entities/Projectile';
import InputController from '../systems/inputs/InputController';
import { AttackEvent } from '../components/AttackComponent';
import { Shot } from '../components/RangedAttack';
import { HealthEvent } from '../components/HealthComponent';
import { FootPoint, MapObject, WorldMap } from '../systems/world/WorldMap';
import { CollisionManager } from '../systems/collision/CollisionManager';

// used only if the map turns up without a PlayerStartPoint on it - somewhere to
// stand is better than the top left corner of the world
const FALLBACK_SPAWN: FootPoint = { x: 400, y: 300 }

// how long the player stays down before respawning
const RESPAWN_DELAY_MS = 2500

// what the player is holding the first time they set out - after that they
// arrive in a level holding whatever they left the last one with
const STARTING_ITEM: ItemId = "diamond-sword"

// what the player carries between levels. the sprite is rebuilt from scratch on
// the other side of a level change, so what travels is the state, not the entity
interface Progress {
    health: number,
    item: ItemId | null,
}

// kept on the game registry rather than in this scene - a scene restart is
// exactly what a level change is, and the registry is what outlives one
const PROGRESS_KEY = "progress"

// number-row shortcuts for swapping gear, until there's an inventory UI
const ITEM_HOTKEYS: Record<string, ItemId | null> = {
    "keydown-ONE": "diamond-sword",
    "keydown-TWO": "diamond-axe",
    "keydown-THREE": "diamond-pickaxe",
    "keydown-ZERO": null, // bare hands
}

export default class GameScene extends Phaser.Scene {

    private world!: WorldMap
    private player!: Player
    private controls!: InputController

    // everything about who can hit what - the scene only says what's in the world
    private collisions!: CollisionManager
    private foes: Foe[] = []
    private projectiles: Projectile[] = []

    // read off the map once, and kept for every respawn after the first
    private spawn: FootPoint = FALLBACK_SPAWN

    // which map is being played, handed in by whatever started this scene
    private level: LevelId = STARTING_LEVEL

    // a level change is a scene restart, and it takes a beat to come round -
    // this is what stops the exit firing again while it's on its way
    private travelling: boolean = false

    constructor() {
        super("GameScene")
    }

    // a restarted scene is the same instance over again, so anything held
    // between frames is put back to how it started rather than left to carry
    init(data: { level?: LevelId }) {
        this.level = data?.level ?? STARTING_LEVEL
        this.foes = []
        this.projectiles = []
        this.travelling = false
    }

    create() {
        // the level first - it sets the world and camera bounds everything else
        // is then spawned inside of
        this.world = new WorldMap(this, this.level)

        // built on the world, since what stops a body is the level itself
        this.collisions = new CollisionManager(this, this.world)

        // create input controller after game starts
        this.controls = new InputController(this)

        this.spawn = this.world.spawn ?? FALLBACK_SPAWN
        
        // spawn player in game scene and give it input controls
        this.player = new Player(this, this.spawn.x, this.spawn.y, "player", this.controls)
            .setScale(SCALE_FACTOR)

        // scaled first, then stood on the floor - the drop is measured off the
        // body the player actually ended up with
        this.world.stand(this.player, this.spawn)
        this.world.follow(this.player, MAP_CAMERA)

        // everything registered after this point is registered against the player
        this.collisions.setPlayer(this.player)

        this.restoreProgress()
        this.bindItemHotkeys()

        this.spawnMapFoes()
        this.watchForExit()

        // listening on the component rather than the bus - it's torn down with the
        // player, so a scene restart can't leave a stale respawn timer behind
        this.player.getHealth.on(HealthEvent.Died, () => {
            this.time.delayedCall(RESPAWN_DELAY_MS, () => {
                this.player.respawn(this.spawn.x, this.spawn.y)
                this.world.stand(this.player, this.spawn)
            })
        })

        // the HUD runs as its own scene - hand it the starting values so it draws
        // the right bar before the first health event arrives. it isn't torn
        // down by a level change, and restoreProgress() has already put the
        // arriving player's health on the bus, so one that's already up is left
        // alone rather than started over
        if (!this.scene.isActive("HealthBar")) {
            this.scene.launch("HealthBar", {
                ratio: this.player.getHealth.ratio,
                busPrefix: PLAYER_HEALTH_BUS,
            })
        }

    }

    // pick the player back up where they left the last level off, or kit them
    // out fresh if this is where they came in
    private restoreProgress(): void {
        const progress = this.registry.get(PROGRESS_KEY) as Progress | undefined

        if (!progress) {
            this.player.equip(STARTING_ITEM)
            return
        }

        // reset() rather than a heal - it announces the new value on the bus,
        // which is what puts the arriving player's health on the HUD
        this.player.getHealth.reset(progress.health)

        if (progress.item) this.player.equip(progress.item)
        else this.player.unequip()
    }

    private saveProgress(): void {
        this.registry.set(PROGRESS_KEY, {
            health: this.player.getHealth.current,
            item: this.player.gear.itemId,
        } satisfies Progress)
    }

    // the exit is a marker like any other until the map says where it goes. a
    // `level` property on it names the next one; without one, this map is simply
    // the end of the line and standing on the exit does nothing
    private watchForExit(): void {
        const exits = this.world.exit
        if (!exits) return

        for (const exit of exits) {
            const next = WorldMap.property<string>(exit, MAP.exitLevelProperty)
            if (!next) continue
    
            if (!(next in LEVELS)) {
                console.warn(`GameScene: "${exit.name}" leads to "${next}", which isn't a level`)
                continue
            }
            this.collisions.watchZone(exit, () => this.travelTo(next as LevelId))
        }
    }

    // off to somewhere else. the overlap that calls this fires every frame the
    // player is stood in the exit, so the first one through wins
    private travelTo(level: LevelId): void {
        if (this.travelling) return

        this.travelling = true
        this.saveProgress()
        this.scene.restart({ level })
    }

    // every foe the map asked for, each stood on its own marker. which foe comes
    // from the object's `foeType` property, or failing that from its name, so
    // a foe can be placed in Tiled without touching any of this
    private spawnMapFoes(): void {
        for (const object of this.world.objects(MAP.objectLayers.enemies)) {
            if (object.type !== MAP.foeType) continue

            const definition = foeDefinitionFor(object)
            if (!definition) continue

            this.spawnFoe(definition, this.world.foot(object))
        }
    }

    // bring a foe into the world and hook it up to the player
    private spawnFoe(definition: FoeDefinition, at: FootPoint): Foe {
        const foe = new Foe(this, at.x, at.y, definition).setTarget(this.player)
        this.foes.push(foe)

        // Foe scales itself in its constructor, so its body is the right size by
        // the time it's put on the floor
        this.world.stand(foe, at)
        this.collisions.addFoe(foe)

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
        this.collisions.addProjectile(projectile)

        projectile.once(Phaser.GameObjects.Events.DESTROY, () => {
            this.projectiles.splice(this.projectiles.indexOf(projectile), 1)
        })

        return projectile
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
        this.collisions.update()
    }
}

// which foe an object on the NPC layer asks for - its `foeType` property wins,
// and its name is the fallback, so "Archer" in Tiled is enough on its own. one
// that names neither is left out rather than guessed at
function foeDefinitionFor(object: MapObject): FoeDefinition | null {
    const candidates = [
        WorldMap.property<string>(object, MAP.foeTypeProperty),
        object.name,
    ]

    for (const candidate of candidates) {
        const id = candidate?.trim().toLowerCase()
        if (id && id in FOES) return FOES[id as FoeId]
    }

    console.warn(`GameScene: no foe matches "${object.name}" - skipping it`)
    return null
}
