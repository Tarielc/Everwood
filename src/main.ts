import { AUTO, Game, Scale } from 'phaser';
import BootScene from './game/scenes/BootScene';
import PreloadScene from './game/scenes/PreloadScene';
import MainMenuScene from './game/scenes/MainMenuScene';
import GameScene from './game/scenes/GameScene';

//  Game Configuration
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: 1280,
    height: 720,
    parent: 'game-container',
    backgroundColor: '#028af8',
    pixelArt: true,
    scale: {
        mode: Scale.FIT,
        autoCenter: Scale.CENTER_BOTH
    },
    physics: {
        default: "matter",
        matter: {
            gravity: { x: 0, y: 1 },
            debug: true,
        }
    },
    scene: [
        BootScene,
        PreloadScene,
        MainMenuScene,
        GameScene
    ]
};

// function to start the game
const StartGame = (parent: string) => {
    return new Game({ ...config, parent });
}

// start game after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    StartGame('game-container');
});

