import * as Phaser from 'phaser';
import { SCALE_FACTOR } from '../config/display';
import { MAP, MAP_CAMERA } from '../config/world';
import { FOES, FoeDefinition, FoeId } from '../data/foes';
import { ItemId } from '../data/items';
import { LEVELS, LevelId, STARTING_LEVEL } from '../data/levels';
import { PLAYER_HEALTH, PLAYER_HEALTH_BUS } from '../data/player';
import Foe from '../entities/Foe';
import Player from '../entities/Player';
import Projectile from '../entities/Projectile';
import InputController from '../systems/inputs/InputController';
import { AttackEvent } from '../components/attack/AttackComponent';
import { Shot } from '../components/attack/RangedAttack';
import { HealthChange, HealthEvent } from '../components/HealthComponent';
import { FootPoint, MapObject, WorldMap } from '../systems/world/WorldMap';
import { CollisionManager } from '../systems/collision/CollisionManager';
import { ImpactController } from '../systems/feel/ImpactController';
import { IMPACT, impactScale } from '../config/feel';
import { WaveDirector, WaveEvent } from '../systems/waves/WaveDirector';
import { TextBanner } from '../ui/TextBanner';
import { AudioController } from '../systems/audio/AudioController';
import { PLAYER_SOUNDS } from '../data/audio';

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

    // what a landed blow does to the world around it - the hitstop and the shake
    private impact!: ImpactController

    private foes: Foe[] = []
    private projectiles: Projectile[] = []

    // what sends in the waves, on the levels that fight them - null anywhere the
    // map places its foes by hand
    private waves: WaveDirector | null = null

    // the "Wave 3" headline, up only on the levels that have waves to announce
    private textBanner: TextBanner | null = null

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

        // both are torn down by the shutdown the restart ran through - what's left
        // here is the stale handle, not the thing
        this.waves = null
        this.textBanner = null
    }

    create() {
        // the level first - it sets the world and camera bounds everything else
        // is then spawned inside of
        this.world = new WorldMap(this, this.level)

        // built on the world, since what stops a body is the level itself
        this.collisions = new CollisionManager(this, this.world)

        // stands before the player and the foes, because both are wired to it as
        // they are built
        this.impact = new ImpactController(this)

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

        // everything spatial is heard from where the player is standing
        AudioController.instance.setListener(this.player)
        this.startLevelAudio()

        this.restoreProgress()
        this.bindItemHotkeys()

        this.spawnMapFoes()
        this.startWaves()
        this.watchForExit()

        // listening on the component rather than the bus - it's torn down with the
        // player, so a scene restart can't leave a stale respawn timer behind
        this.player.getHealth.on(HealthEvent.Died, () => this.onPlayerDeath())

        // every hit that actually landed, whatever dealt it - a swing, an arrow or
        // walking into something. i-frames swallowing one fires nothing, so a hit
        // that cost no health shakes nothing either
        this.player.getHealth.on(HealthEvent.Damaged, (change: HealthChange) => {
            this.impact.hit(IMPACT.playerHurt, impactScale(change.amount, change.max))
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

    // what the level sounds like. both beds are crossfaded rather than cut, and asking
    // for what is already playing does nothing - so walking back into a level that shares
    // a track with the last one carries straight on rather than starting it over
    private startLevelAudio(): void {
        const { music, ambience } = LEVELS[this.level]
        const audio = AudioController.instance

        if (music) audio.playMusic(music)
        if (ambience) audio.playAmbience(ambience)
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

    // `health` is spelled out for a player who is leaving dead - what they arrive
    // with somewhere else is not what they had left when they fell over
    private saveProgress(health: number = this.player.getHealth.current): void {
        this.registry.set(PROGRESS_KEY, {
            health,
            item: this.player.gear.itemId,
        } satisfies Progress)
    }

    // the player is down. a level that names somewhere to be sent throws them out to
    // it, kit and all and patched up on the way - an arena has no other exit. anywhere
    // else they get back up where they fell, the way they always have
    private onPlayerDeath(): void {
        // nothing else arrives while the body is still on the floor
        this.waves?.stop()

        const returnTo = LEVELS[this.level].deathReturnsTo

        this.time.delayedCall(RESPAWN_DELAY_MS, () => {
            if (returnTo) {
                this.travelTo(returnTo, PLAYER_HEALTH.max)
                return
            }

            this.player.respawn(this.spawn.x, this.spawn.y)
            this.world.stand(this.player, this.spawn)
        })
    }

    // the exit is a marker like any other until the map says where it goes. a
    // `nextLevel` property on it names the next one; without one, this map is simply
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
    private travelTo(level: LevelId, health?: number): void {
        if (this.travelling) return

        this.travelling = true
        this.saveProgress(health)
        this.scene.restart({ level })
    }

    // every foe the map asked for, each stood on its own marker. which foe comes
    // from the object's `foeType` property, or failing that from its name, so
    // a foe can be placed in Tiled without touching any of this
    private spawnMapFoes(): void {
        for (const object of this.world.objects(MAP.objectLayers.enemies)) {
            if (object.type !== MAP.foeType) continue

            // a wave marker sits on the same layer and wears the same type - it's a
            // door the waves come through, not a foe standing there
            if (isWaveSpawnPoint(object)) continue

            const definition = foeDefinitionFor(object)
            if (!definition) continue

            this.spawnFoe(definition, this.world.foot(object))
        }
    }

    // levels that fight waves say so in their definition, and mark on the map where
    // the waves come in. one without either simply never starts a run
    private startWaves(): void {
        const config = LEVELS[this.level].waves
        if (!config) return

        const points = this.world.objects(MAP.objectLayers.enemies)
            .filter(isWaveSpawnPoint)
            .map(object => this.world.foot(object))

        if (points.length === 0) {
            console.warn(`GameScene: "${this.level}" fights waves but has no "${MAP.waveSpawnPoint}" on its map`)
            return
        }

        this.textBanner = new TextBanner(this)
        const audio = AudioController.instance

        // the director decides what arrives and when; spawnFoe() is what the scene
        // already does with a foe the map placed, and waves get the same treatment
        this.waves = new WaveDirector(this, config, points, (definition, at) => this.spawnFoe(definition, at))
        this.waves.on(WaveEvent.Started, (wave: number) => {
            this.textBanner?.announce(`Wave ${wave}`, true)
            // both of these duck the music while they play, so the arena is heard
            // announcing itself rather than competing with the drums
            audio.play("wave-start")
        })
        // when wave ends, heal the player
        this.waves.on(WaveEvent.Cleared, () => {
            audio.play("wave-cleared")

            // heal the player to max hp in the middle of break
            const wavesBreakMs = this.waves?.waveConfig.breakMs ?? 0
            this.time.delayedCall(wavesBreakMs / 2, () => {
                // played on the heal itself rather than on the health event, which
                // regen also fires - this is the moment the player is meant to notice
                if (this.player.heal(this.player.getHealth.max)) {
                    audio.play(PLAYER_SOUNDS.heal)
                }
            })
            
        })
        this.waves.start()
    }

    // a foe as this level fields it. on a level that hunts, both aggro ranges go
    // unbounded - the wider one has to go too, or a foe would acquire the player from
    // across the map and drop the chase again on the very next frame, over and over.
    // the attack ranges are left alone, so what a foe can reach is still what it could
    private asHuntedIn(definition: FoeDefinition): FoeDefinition {
        if (!LEVELS[this.level].foesAlwaysHunt) return definition

        return { ...definition, aggroRange: Infinity, deAggroRange: Infinity }
    }

    // bring a foe into the world and hook it up to the player
    private spawnFoe(definition: FoeDefinition, at: FootPoint): Foe {
        const foe = new Foe(this, at.x, at.y, this.asHuntedIn(definition)).setTarget(this.player)
        this.foes.push(foe)

        // Foe scales itself in its constructor, so its body is the right size by
        // the time it's put on the floor
        this.world.stand(foe, at)
        this.collisions.addFoe(foe)

        // the same listeners the player has, from the other side of the swing. both
        // fire on a killing blow, and the impacts fold into one rather than stacking -
        // which is what makes a kill land heavier than a hit without stuttering
        foe.getHealth.on(HealthEvent.Damaged, (change: HealthChange) => {
            this.impact.hit(IMPACT.foeHit, impactScale(change.amount, change.max))
        })
        foe.getHealth.on(HealthEvent.Died, () => this.impact.hit(IMPACT.foeDeath))

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
        // a blow that just landed holds the whole frame, input included - a press made
        // during the freeze is still a fresh press on the frame it lifts, rather than
        // an edge sampled into a frame that never ran
        if (this.impact.update(delta)) return

        // sample input once per frame, before anything consumes it
        this.controls.update()

        // update player
        this.player.update(time, delta)

        // backwards, so a foe removing itself mid-loop can't skip the next one
        for (let i = this.foes.length - 1; i >= 0; i--) {
            this.foes[i].update(delta)
        }

        // same again - a shot that expires this frame drops out of the list
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            this.projectiles[i].update(time, delta)
        }

        // last, so every swing lands against where everything actually ended up
        this.collisions.update()
    }
}

// a marker the waves come in at rather than a foe standing on the spot. matched on
// either the object's type or its name, so it can be authored in Tiled as a class of
// its own or dropped in as a named object on the ordinary foe type
function isWaveSpawnPoint(object: MapObject): boolean {
    return object.type === MAP.waveSpawnPoint || object.name === MAP.waveSpawnPoint
}

// which foe an object on the enemies layer asks for - its `foeType` property wins,
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
