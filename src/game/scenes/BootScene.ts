import * as Phaser from 'phaser';
import { AudioController } from '../systems/audio/AudioController';
import { loadMapDefinitions } from '../systems/world/WorldMap';
import { BITMAP_FONTS } from '../config/ui';
import { ATLAS, ATLAS_PATH } from '../config/atlas';

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
        // the game's mixer, built the moment there is a game to build it on - the bank
        // it plays out of is loaded later, in PreloadScene
        AudioController.init(this.game)

        for (const font of BITMAP_FONTS) {
            this.load.bitmapFont(font, `assets/fonts/${font}.png`, `assets/fonts/${font}.xml`);
        }
        this.load.image("load-bg", "assets/ui/load-bg.png");

        // every sprite and HUD image is one atlas - it comes in here because the
        // progress bar PreloadScene draws is part of it
        this.load.atlas(ATLAS, ATLAS_PATH.image, ATLAS_PATH.data)

        // the maps come in first, so PreloadScene can read the tileset and
        // backdrop images off them instead of listing them a second time
        loadMapDefinitions(this.load);
    }

    /**
     * Scene's create function to start {@link preloadScene}
     */
    create() {
        // pixelArt makes every texture NEAREST - the fonts are drawn far below the
        // size their glyphs were baked at, so they need smooth filtering or they go jagged
        for (const font of BITMAP_FONTS) {
            this.textures.get(font).setFilter(Phaser.Textures.FilterMode.LINEAR)
        }
        this.scene.start("PreloadScene")
    }
}