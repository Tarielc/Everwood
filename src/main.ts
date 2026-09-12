import { AUTO, Game, Scale } from 'phaser';
import BootScene from './game/scenes/BootScene';
import PreloadScene from './game/scenes/PreloadScene';
import MainMenuScene from './game/scenes/MainMenuScene';
import GameScene from './game/scenes/GameScene';
import HealthBar from './game/ui/HealthBar';

//  Game Configuration
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    parent: 'game-container',
    backgroundColor: '#028af8',
    pixelArt: true,
    roundPixels: true,
    scale: {
        mode: Scale.EXPAND,
        autoCenter: Scale.CENTER_BOTH,
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
        HealthBar
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

