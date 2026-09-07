import * as Phaser from 'phaser';
import { PLAYER_HEALTH_BUS, SCALE_FACTOR } from '../utils/constants';
import Player from '../entities/Player';
import InputController from '../systems/inputs/InputController';
import { HealthEvent } from '../components/HealthComponent';

// where the player spawns and respawns
const SPAWN = { x: 400, y: 300 }

// damage the fox deals on contact - the player's i-frames space the hits out
const FOX_CONTACT_DAMAGE = 22

// how long the player stays down before respawning
const RESPAWN_DELAY_MS = 2500

export default class GameScene extends Phaser.Scene {

    private player!: Player
    private controls!: InputController

    constructor() {
        super("GameScene")
    }

    create() {
        // create input controller after game starts
        this.controls = new InputController(this)

        // spawn player in game scene and give it input controls
        this.player = new Player(this, SPAWN.x, SPAWN.y, "player", this.controls)
            .setScale(SCALE_FACTOR)

        this.player.setCollideWorldBounds(true)

        const fox = this.physics.add
            .sprite(150, this.scale.height / 2, "fox")
            .setScale(SCALE_FACTOR)
            .setCollideWorldBounds(true)

        // fires every frame of the overlap - takeDamage() ignores the hits that land
        // during i-frames, so contact damage paces itself
        this.physics.add.overlap(this.player, fox, () => {
            this.player.takeDamage(FOX_CONTACT_DAMAGE, fox)
        })

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

    update(time:number, delta:number){
        // sample input once per frame, before anything consumes it
        this.controls.update()

        // update player
        this.player.update(time, delta)
    }
}
