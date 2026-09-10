import * as Phaser from 'phaser';
import { loadMapDefinitions } from '../systems/world/WorldMap';

export default class BootScene extends Phaser.Scene{
    constructor(){
        super('BootScene');
    }

    preload(){
        this.load.bitmapFont("Jacquard24", "assets/fonts/Jacquard24.png", "assets/fonts/Jacquard24.xml");
        this.load.image("load-bg", "assets/ui/load-bg.png");

        // the maps come in first, so PreloadScene can read the tileset and
        // backdrop images off them instead of listing them a second time
        loadMapDefinitions(this.load);
    }

    create() {
        this.scale.on("resize", this.handleResize, this);
        this.scene.start("PreloadScene")
    }

    handleResize() {
        // TODO: handle resize
    }
}