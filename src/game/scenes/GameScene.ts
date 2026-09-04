import * as Phaser from 'phaser';

export default class GameScene extends Phaser.Scene {
    constructor() {
        super("GameScene")
    }

    create() {
        console.log("Game Started")
    }
}