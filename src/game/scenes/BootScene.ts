import * as Phaser from 'phaser';

export default class BootScene extends Phaser.Scene{
    constructor(){
        super('BootScene');
    }

    preload(){
        console.log("Bootscene")
    }
}