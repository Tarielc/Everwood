import * as Phaser from 'phaser';
import { SCALE_FACTOR } from '../config/display';
import { MAP, MAP_CAMERA } from '../config/world';
import { FOES, FoeBoss, FoeDefinition, FoeId } from '../data/foes';
import { WeaponId } from '../data/weapons';
import { LEVELS, LevelId, STARTING_LEVEL } from '../data/levels';
import { PLAYER_HEALTH, PLAYER_HEALTH_BUS } from '../data/player';
import Foe, { FoeEvent } from '../entities/Foe';
import Player from '../entities/Player';
import Projectile from '../entities/Projectile';
import PowerUp from '../entities/PowerUp';
import { POWER_UP_DROP, PowerUpDefinition, PowerUpId } from '../data/powerUps';
import { PowerUpDropper } from '../systems/loot/PowerUpDropper';
import { PowerUpTray } from '../ui/PowerUpTray';
import { POWER_UP_CALLOUT } from '../config/ui';
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
import { MapHints } from '../ui/MapHints';
import { MapDialogue } from '../ui/MapDialogue';
import { WaveCounter } from '../ui/WaveCounter';
import { BossBar } from '../ui/BossBar';
import { AudioController } from '../systems/audio/AudioController';
import { PLAYER_SOUNDS } from '../data/audio';
import type { EndOutcome, EndSceneData } from './EndScene';
import type { ArenaRun } from './LeaderboardScene';
import { RANKED_LEVEL } from '../data/leaderboard';

/** Backup spawn point if the map has no PlayerStartPoint set on it */
const FALLBACK_SPAWN: FootPoint = { x: 400, y: 300 }

/** How long the player stays knocked down before the end screen goes up */
const RESPAWN_DELAY_MS = 2500

/** How long the last foe of a winning level gets to fall over before the victory screen */
const VICTORY_DELAY_MS = 2000

/** Player's starting weapon - only used on a fresh run, a level change keeps whatever they were holding */
const STARTING_WEAPON: WeaponId = "diamond-sword"

/** Player progress tracker - data that travels between levels */
interface Progress {
    /** Health the player arrives in the next level with */
    health: number,
    /** Weapon the player is holding, `null` for bare hands */
    weapon: WeaponId | null,
}

/**
 * Registry key for {@link Progress}. A scene restart is exactly what a level change is,
 * and the registry is what outlives one
 */
const PROGRESS_KEY = "progress"

/**
 * Temporary placeholder to switch between weapons.
 * 
 * Only accessible on desktop.
 */
const WEAPON_HOTKEYS: Record<string, WeaponId | null> = {
    "keydown-ONE": "diamond-sword",
    "keydown-ZERO": null, // bare hands
}

/**
 * Main game scene, where the player and foes live and die. The map is the level, and
 * the player is the only thing that carries over between them - the rest is torn down
 * and rebuilt on a level change.
 * 
 * The scene is the only thing that knows what level is being played, and it hands the
 * level's map to the world, which is what actually builds the level. The scene then
 * spawns the player and any foes the map placed, and starts the waves if the level
 * fights them.
 */
export default class GameScene extends Phaser.Scene {

    /** Current world map - builds the level and sets the world and camera bounds */
    private world!: WorldMap
    /** Player entity */
    private player!: Player
    /** Input controls - either keyboard or touch screen */
    private controls!: InputController

    /** Everything about who can hit what, and what overlaps with what */
    private collisions!: CollisionManager

    /** What a landed blow does to the world around it - the hitstop and the shake */
    private impact!: ImpactController

    /** Every foe in the current scene */
    private foes: Foe[] = []
    /** Every projectile in the current scene */
    private projectiles: Projectile[] = []
    /** Every power-up in the current scene */
    private powerUps: PowerUp[] = []

    /** Rolls every landed hit for a power-up drop, and caps how many are on the floor to avoid clutter */
    private dropper!: PowerUpDropper

    /** Running power-ups displayed on the HUD (under the health bar) */
    private powerUpTray!: PowerUpTray

    /** Sends in the enemy waves on a level that fights them. `null` anywhere the map places its foes by hand */
    private waves: WaveDirector | null = null

    /** Headline banner for wave announcements - `null` on levels without waves */
    private textBanner: TextBanner | null = null
    /** Standing wave counter kept up between {@link textBanner} announcements - `null` on levels without waves */
    private waveCounter: WaveCounter | null = null

    /** Boss's name and health bar, built during the first boss encounter and reused for any that come after */
    private bossBar: BossBar | null = null

    /** Tutorial hint lines like "Space to jump", shown while the player stands by them */
    private hints!: MapHints

    /** Dialogue bubbles for map characters - currently no NPC class entity is implemented, so every speech bubble is placed in Tiled by hand */
    private dialogue!: MapDialogue

    /** Where the player gets back up after a death - the map's PlayerStartPoint, moved by any checkpoint touched */
    private spawn: FootPoint = FALLBACK_SPAWN

    /** Current level ID - which map is being played, handed in by whatever started this scene */
    private level: LevelId = STARTING_LEVEL

    /** A level change is a scene restart - this stops the exit firing non-stop while it's on its way */
    private travelling: boolean = false

    /** Whether the run is over, one way or the other - the first ending to land is the one that counts */
    private finished: boolean = false

    /** How deep a ranked run got, taken the moment the player falls - `null` on every other level */
    private rankedRun: ArenaRun | null = null

    /** Registers the scene under the `GameScene` key */
    constructor() {
        super("GameScene")
    }

    /**
     * A restarted scene is the same instance over again, so anything held
     * between frames is put back to how it started rather than left to carry over.
     * 
     * The level is passed in on the data, and the rest is reset to the defaults for a new run.
     * 
     * @param data - the level to play, defaults to `STARTING_LEVEL`
     */
    init(data: { level?: LevelId }) {
        this.level = data?.level ?? STARTING_LEVEL
        this.foes = []
        this.projectiles = []
        this.powerUps = []
        this.travelling = false
        this.finished = false
        this.rankedRun = null

        // both are torn down by the shutdown the restart ran through - what's left
        // here is the stale handle, not the thing
        this.waves = null
        this.textBanner = null
        this.waveCounter = null
        this.bossBar = null
    }

    /**
     * Creates the game scene and initializes all necessary components.
     * 
     * This method sets up the world, player, controls, collisions, impact controller,
     * power-up dropper, power-up tray, progress restoration, weapon hotkeys, foe spawning,
     * wave management, exit and hazard monitoring, checkpoint handling, hints, dialogue, and health bar.
     * 
     * It also sets up event listeners for player death and damage events.
     */
    create() {
        // before any body exists, so nothing spends a frame under the wrong pull
        this.applyWorldConfig()

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
        this.player = new Player(this, this.spawn.x, this.spawn.y, this.controls)
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

        // decides whether a hit drops something - spawnPowerUp() is how it gets into the world
        this.dropper = new PowerUpDropper((id, definition, x, y) => this.spawnPowerUp(id, definition, x, y))
        this.powerUpTray = new PowerUpTray(this, this.player.statusEffects)

        this.restoreProgress()
        this.bindWeaponHotkeys()

        this.spawnMapFoes()
        this.startWaves()
        this.watchForExit()
        this.watchForHazards()
        this.watchForCheckpoints()

        // after the controls, which decide whether a hint names a key or a button
        this.hints = new MapHints(this, this.world, this.controls.touch)
        this.dialogue = new MapDialogue(this, this.world)

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

    /**
     * Apply the level's physics overrides. Arcade builds a fresh world from the game config
     * on every scene start, so a level change can't carry the last level's settings over -
     * only what this level sets needs putting on.
     */
    private applyWorldConfig(): void {
        const config = LEVELS[this.level].world
        if (!config) return

        if (config.gravity !== undefined) this.physics.world.gravity.y = config.gravity
    }

    /**
     * Start the level's music and ambience with a crossfade. Walking back into a level that shares a track
     * with the last level carries on rather than starting over.
     */
    private startLevelAudio(): void {
        const { music, ambience } = LEVELS[this.level]
        const audio = AudioController.instance

        if (music) audio.playMusic(music)
        if (ambience) audio.playAmbience(ambience)
    }

    /**
     * Retrieve progress data from the registry and restore the player's health and weapon.
     * With nothing saved, this is a fresh run and the player gets `STARTING_WEAPON`.
     */
    private restoreProgress(): void {
        const progress = this.registry.get(PROGRESS_KEY) as Progress | undefined

        if (!progress) {
            this.player.equip(STARTING_WEAPON)
            return
        }

        // reset() rather than a heal - it announces the new value on the bus,
        // which is what puts the arriving player's health on the HUD
        this.player.getHealth.reset(progress.health)

        if (progress.weapon) this.player.equip(progress.weapon)
        else this.player.unequip()
    }

    /**
     * Save player progress to the registry - health and weapon.
     *
     * @param health - the health to arrive with, defaults to current health. Spelled out
     * for a player leaving dead, who shouldn't arrive with what they fell on
     */
    private saveProgress(health: number = this.player.getHealth.current): void {
        this.registry.set(PROGRESS_KEY, {
            health,
            weapon: this.player.gear.weaponId,
        } satisfies Progress)
    }

    /**
     * Handle player death event. Mark game as finished,
     * take the ranked run if applicable, stop any ongoing waves,
     * and display the end screen after a delay. A win that already landed stands.
     */
    private onPlayerDeath(): void {
        if (this.finished) return
        this.finished = true

        // before the run is stopped - a foe that dies after the player does isn't theirs
        this.rankedRun = this.takeRankedRun()

        // nothing else arrives while the body is still on the floor
        this.waves?.stop()

        this.time.delayedCall(RESPAWN_DELAY_MS, () => this.showEndScreen("defeat"))
    }

    /**
     * The run as the leaderboard ranks it.
     *
     * @returns the wave reached and kills on `RANKED_LEVEL`, or `null` on any other
     * level or if the player died before the first wave landed
     */
    private takeRankedRun(): ArenaRun | null {
        if (this.level !== RANKED_LEVEL || !this.waves || this.waves.wave === 0) return null

        return { wave: this.waves.wave, kills: this.waves.kills }
    }

    /**
     * Going again after a death. A level with `deathReturnsTo` sends the player there,
     * kit and all and fully healed. Otherwise, respawn the player at the last checkpoint
     * or the map's start point.
     */
    private retryAfterDeath(): void {
        const returnTo = LEVELS[this.level].deathReturnsTo

        if (returnTo) {
            this.travelTo(returnTo, PLAYER_HEALTH.max)
            return
        }

        this.finished = false
        this.player.respawn(this.spawn.x, this.spawn.y)
        this.world.stand(this.player, this.spawn)
    }

    /**
     * Win a level that's won by clearing it (`winWhenCleared`) the moment every foe in it
     * is dead. Foes still fading out are already dead, so they don't hold the screen back.
     */
    private checkCleared(): void {
        if (this.finished || !LEVELS[this.level].winWhenCleared) return
        if (this.player.getHealth.isDead) return
        if (!this.foes.every(foe => foe.getHealth.isDead)) return

        this.finished = true
        this.waves?.stop()

        this.time.delayedCall(VICTORY_DELAY_MS, () => {
            AudioController.instance.play("wave-cleared")
            this.showEndScreen("victory")
        })
    }

    /**
     * Pause the level where it stands and put the end screen over it.
     * 
     * @param outcome - the outcome of the run, either "victory" or "defeat"
     */
    private showEndScreen(outcome: EndOutcome): void {
        this.scene.pause()
        this.scene.launch("EndScene", {
            outcome,
            onRetry: () => {
                this.scene.resume()
                if (outcome === "defeat") this.retryAfterDeath()
                else this.startOver(STARTING_LEVEL)
            },
            onMenu: () => this.startOver(),
            run: outcome === "defeat" ? this.rankedRun ?? undefined : undefined,
        } satisfies EndSceneData)
    }

    /**
     * A fresh run, or back to the menu when no level is given. Nothing is carried over,
     * and the HUD comes down too - it's relaunched with the new player's health rather than
     * left showing what the last one finished on.
     * 
     * @param level - the level to start over with, or undefined to return to the main menu
     */
    private startOver(level?: LevelId): void {
        this.travelling = true
        this.registry.remove(PROGRESS_KEY)
        this.scene.stop("HealthBar")

        if (level) this.scene.restart({ level })
        else this.scene.start("MainMenuScene")
    }

    /**
     * Update the player's spawn point upon touching a checkpoint.
     * The last one touched wins, so walking back over an earlier one moves the spawn back.
     */
    private watchForCheckpoints(): void {
        for (const checkpoint of this.world.checkpoints) {
            const point = this.world.foot(checkpoint)

            this.collisions.watchZone(checkpoint, () => {
                if (this.player.getHealth.isDead) return
                this.spawn = point
            })
        }
    }

    /**
     * Spikes and anything else that kills on touch. The overlap fires every frame, but dead players can't be killed twice.
     */
    private watchForHazards(): void {
        for (const hazard of this.world.hazards) {
            this.collisions.watchZone(hazard, () => this.player.kill(hazard))
        }
    }

    /**
     * For every exit object, watch for the player's overlap and send them to the
     * level its `nextLevel` property names. An exit without one does nothing.
     */
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

    /**
     * Send the player to a different level. The overlap that calls this fires every frame
     * the player is stood in the exit, so only the first one through wins.
     * 
     * @param level - the level to travel to
     * @param health - the player's health to save in the progress registry, defaults to current health
     */
    private travelTo(level: LevelId, health?: number): void {
        if (this.travelling) return

        this.travelling = true
        this.saveProgress(health)
        this.scene.restart({ level })
    }

    /**
     * Spawn foes on the map based on the enemy objects defined in the map's object layer.
     * It ignores wave spawn points and only spawns actual foes, picked by the
     * `foeType` custom property or, failing that, the object's name.
     */
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

    /**
     * Levels that contain waves, say so in their definition, and mark on the map where
     * the waves come in. One without either simply never starts a run.
     */
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
        this.waveCounter = new WaveCounter(this)
        const audio = AudioController.instance

        // the director decides what arrives and when; spawnFoe() is what the scene
        // already does with a foe the map placed, and waves get the same treatment
        this.waves = new WaveDirector(this, config, points, (definition, at) => this.spawnFoe(definition, at))
        this.waves.on(WaveEvent.Started, (wave: number) => {
            this.textBanner?.announce(`Wave ${wave}`, true)
            this.waveCounter?.set(wave)
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

    /**
     * A modified foe definition for this specific level.
     * 
     * On a level with `foesAlwaysHunt`, foes have infinite aggro and de-aggro ranges.
     * The attack ranges are left unchanged, so the foe's reach remains the same.
     * 
     * @param definition - the original foe definition
     * @returns modified foe definition for this level,
     * or the original if the level doesn't force hunting.
     */
    private asHuntedIn(definition: FoeDefinition): FoeDefinition {
        if (!LEVELS[this.level].foesAlwaysHunt) return definition

        return { ...definition, aggroRange: Infinity, deAggroRange: Infinity }
    }

    /**
     * Bring a foe into the world and hook it up to the player, collisions, impacts,
     * loot drops, summons and the boss bar.
     *
     * `grounded` puts it on the floor at `at` - a summon passes false, and appears
     * in the air right there.
     * 
     * @param definition - definition of the foe to spawn
     * @param at - position to spawn the foe at
     * @param grounded - whether the foe should be placed on the floor
     * @returns the spawned foe
     */
    private spawnFoe(definition: FoeDefinition, at: FootPoint, grounded = true): Foe {
        const foe = new Foe(this, at.x, at.y, this.asHuntedIn(definition)).setTarget(this.player)
        this.foes.push(foe)

        // Foe scales itself in its constructor, so its body is the right size by
        // the time it's put on the floor
        if (grounded) {
            this.world.stand(foe, at)

            // after stand(), which would otherwise pull a hovering flier back down onto the floor
            if (definition.flying && definition.hoverHeight) {
                foe.y -= definition.hoverHeight
                ;(foe.body as Phaser.Physics.Arcade.Body).updateFromGameObject()
            }
        }
        this.collisions.addFoe(foe)

        if (definition.boss) this.showBossBar(foe, definition.boss)

        // a boss calling for help - whatever it asks for arrives beside it, counted as its own
        foe.on(FoeEvent.Summon, (id: string, x: number, y: number) => {
            if (!(id in FOES)) {
                console.warn(`GameScene: "${definition.name}" summons "${id}", which isn't a foe`)
                return
            }
            foe.addMinion(this.spawnFoe(FOES[id as FoeId], { x, y }, false))
        })

        // the same listeners the player has, from the other side of the swing. both
        // fire on a killing blow, and the impacts fold into one rather than stacking -
        // which is what makes a kill land heavier than a hit without stuttering
        foe.getHealth.on(HealthEvent.Damaged, (change: HealthChange) => {
            this.impact.hit(IMPACT.foeHit, impactScale(change.amount, change.max))

            // only the player's blows roll for loot - a bomber going off doesn't count
            if (change.source === this.player) {
                const center = (foe.body as Phaser.Physics.Arcade.Body).center
                this.dropper.roll(center.x, center.y)
            }
        })
        foe.getHealth.on(HealthEvent.Died, () => {
            this.impact.hit(IMPACT.foeDeath)
            this.checkCleared()
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

    /**
     * A boss gets its health bar shown on the HUD for as long as it's alive.
     * 
     * @param foe - the foe that is a boss
     * @param boss - the boss definition containing the title to display
     */
    private showBossBar(foe: Foe, boss: FoeBoss): void {
        this.bossBar ??= new BossBar(this)
        this.bossBar.track(foe.getHealth, boss.title)
    }

    /**
     * Put a projectile in the world and set up its collision handling.
     *
     * @param shot - shot information containing projectile type, position, direction, damage and shooter
     * @returns spawned projectile
     */
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

    /**
     * Spawn a power-up in the world and set up its collision handling for pickup by the player.
     * 
     * @param id - the power-up ID
     * @param definition - the power-up definition containing its properties
     * @param x - the x-coordinate to spawn the power-up at
     * @param y - the y-coordinate to spawn the power-up at
     * @returns spawned power-up
     */
    private spawnPowerUp(id: PowerUpId, definition: PowerUpDefinition, x: number, y: number): PowerUp {
        const powerUp = new PowerUp(this, x, y, id, definition)
        this.powerUps.push(powerUp)

        this.collisions.addPickup(powerUp, () => this.collectPowerUp(powerUp))

        powerUp.once(Phaser.GameObjects.Events.DESTROY, () => {
            this.powerUps.splice(this.powerUps.indexOf(powerUp), 1)
        })

        return powerUp
    }

    /**
     * The player walked over a power-up - the effect goes on, and the name floats up off it.
     *
     * @param powerUp - the power-up that was picked up
     */
    private collectPowerUp(powerUp: PowerUp): void {
        const { definition } = powerUp
        this.player.applyPowerUp(powerUp.id, definition)

        AudioController.instance.play(POWER_UP_DROP.pickupSound)
        this.showCallout(definition.name, definition.tint, powerUp.x, powerUp.y)
    }

    /**
     * A word rising off the power-up and fading out.
     *
     * @param label - the text to display in the callout
     * @param tint - the color tint to apply to the callout text
     * @param x - the x-coordinate to position the callout
     * @param y - the y-coordinate to position the callout
     */
    private showCallout(label: string, tint: number, x: number, y: number): void {
        const { font, size, shadow, rise, durationMs, depth } = POWER_UP_CALLOUT
        const text = this.add.bitmapText(x, y, font, label, size)
            .setOrigin(0.5, 1)
            .setDepth(depth)
            .setTint(tint)
            .setDropShadow(1, 1, shadow, 1)

        this.tweens.add({
            targets: text,
            y: y - rise,
            alpha: 0,
            duration: durationMs,
            ease: "Quad.easeOut",
            onComplete: () => text.destroy(),
        })
    }

    /** Temporary stand-in for weapon selection - swap weapons with the number row. See {@link WEAPON_HOTKEYS} */
    private bindWeaponHotkeys(): void {
        const keyboard = this.input.keyboard
        if (!keyboard) return

        for (const [event, weapon] of Object.entries(WEAPON_HOTKEYS)) {
            keyboard.on(event, () => {
                if (weapon) this.player.equip(weapon)
                else this.player.unequip()
            })
        }
    }

    /**
     * Update the game scene, including player, foes, projectiles, power-ups, and collisions.
     * 
     * Called every frame. The whole frame is skipped while a hitstop holds, then input is
     * sampled once, and collisions run last so every swing lands against where everything ended up.
     * 
     * @param time - the current time in ms since the game started
     * @param delta - the time elapsed since the last frame, in ms
     */
    update(time:number, delta:number){
        // a blow that just landed holds the whole frame, input included - a press made
        // during the freeze is still a fresh press on the frame it lifts, rather than
        // an edge sampled into a frame that never ran
        if (this.impact.update(delta)) return

        // sample input once per frame, before anything consumes it
        this.controls.update()

        // update player
        this.player.update(time, delta)
        this.hints.update(this.player, this.controls)
        this.dialogue.update(this.player)

        // backwards, so a foe removing itself mid-loop can't skip the next one
        for (let i = this.foes.length - 1; i >= 0; i--) {
            this.foes[i].update(delta)
        }

        // same again - a shot that expires this frame drops out of the list
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            this.projectiles[i].update(time, delta)
        }

        for (let i = this.powerUps.length - 1; i >= 0; i--) {
            this.powerUps[i].update(delta)
        }
        this.powerUpTray.update(time)

        // last, so every swing lands against where everything actually ended up
        this.collisions.update()
    }
}

/**
 * Check whether an object is a wave spawn point - a marker the waves come in at rather
 * than a foe standing on the spot. Matched on either the object's type or its name.
 * 
 * @param object - the map object to check
 * @returns `true` if the object is a wave spawn point, `false` otherwise
 */
function isWaveSpawnPoint(object: MapObject): boolean {
    return object.type === MAP.waveSpawnPoint || object.name === MAP.waveSpawnPoint
}

/**
 * Which foe an object on the enemies layer asks for - its `foeType` property wins,
 * and its name is the fallback. One that names neither is skipped with a warning.
 * 
 * @param object - the map object to check for foe definition
 * @returns the corresponding foe definition if found, or `null` if no match is found
 */
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
