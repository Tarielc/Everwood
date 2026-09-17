import { AUTO, Game, Scale } from 'phaser';
import BootScene from './game/scenes/BootScene';
import PreloadScene from './game/scenes/PreloadScene';
import MainMenuScene from './game/scenes/MainMenuScene';
import GameScene from './game/scenes/GameScene';
import HealthBar from './game/ui/HealthBar';
import { fitToParent } from './game/utils/viewport';
import { MIN_VIEW_HEIGHT } from './game/config/display';
import UIScene from './game/scenes/UIScene';

//  Game Configuration
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    parent: 'game-container',
    backgroundColor: '#028af8',
    pixelArt: true,
    roundPixels: true,
    // sized by fitToParent() instead - RESIZE, but with a minimum height, so a
    // phone in landscape shows the adequate height view rather than a stripped version of it
    scale: {
        mode: Scale.NONE,
        width: 1280,
        height: 720,
    },
    physics: {
        default: "arcade",
        arcade: {
            gravity: { x: 0, y: 300 },
            debug: true,
        }
    },
    scene: [
        BootScene,
        PreloadScene,
        MainMenuScene,
        GameScene,
        HealthBar,
        UIScene
    ]
};

// function to start the game
const StartGame = (parent: string) => {
    const game = new Game({ ...config, parent });
    fitToParent(game, MIN_VIEW_HEIGHT);
    return game;
}

// start game after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const game = StartGame('game-container');
    console.log(game)
});

