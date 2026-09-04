import * as Phaser from 'phaser';

export default class BootScene extends Phaser.Scene{
    constructor(){
        super('BootScene');
    }

    preload(){
        this.load.bitmapFont("Jacquard24", "assets/fonts/Jacquard24.png", "assets/fonts/Jacquard24.xml");
        this.load.image("load-bg", "assets/ui/load-bg.png");
    }

    create() {
        this.scale.on("resize", this.handleResize, this);
        this.scene.start("PreloadScene")
    }

    handleResize() {
        // TODO: handle resize
    }
}