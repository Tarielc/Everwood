import * as Phaser from 'phaser';
import { loadMapDefinitions } from '../systems/world/WorldMap';

/**
 * Scene where most basic assets load
 * 
 * So we can have resources listener and loading bar in {@link preloadScene}
 * where most of the loading happens
 */
export default class BootScene extends Phaser.Scene{
    /** Every class that extends Scene needs to reload super()  */
    constructor(){
        super('BootScene');
    }

    /**
     * BootSene's most preload where resource loading is handled
     */
    preload(){
        this.load.bitmapFont("Jacquard24", "assets/fonts/Jacquard24.png", "assets/fonts/Jacquard24.xml");
        this.load.image("load-bg", "assets/ui/load-bg.png");

        // the maps come in first, so PreloadScene can read the tileset and
        // backdrop images off them instead of listing them a second time
        loadMapDefinitions(this.load);
    }

    /**
     * Scene's create function to start {@link preloadScene}
     */
    create() {
        this.scene.start("PreloadScene")
    }
}