import * as Phaser from 'phaser';
import { SCALE_FACTOR } from '../utils/constants';
import Player from '../entities/Player';
import InputController from '../systems/InputController';

export default class GameScene extends Phaser.Scene {

    private player!: Player
    private controls!: InputController

    constructor() {
        super("GameScene")
    }

    create() {
        // create input controller after game starts
        this.controls = new InputController(this)

        // spawn player in game scene at (400, 300) and give it input controls
        this.player = new Player(this, 400, 300, "player", this.controls)
            .setScale(SCALE_FACTOR)

        this.player.setCollideWorldBounds(true)
    }

    update(time:number, delta:number){
        // sample input once per frame, before anything consumes it
        this.controls.update()

        // update player
        this.player.update(time, delta)
    }
}
