import { AUTO, Game } from 'phaser';
import BootScene from './game/scenes/BootScene';

//  Game Configuration
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: 1280,
    height: 720,
    parent: 'game-container',
    backgroundColor: '#028af8',
    physics: {
        default: "matter",
        matter: {
            gravity: { x: 0, y: 0 },
            debug: true,
        }
    },
    scene: [
        BootScene,
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

