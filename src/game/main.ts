import { AUTO, Game } from 'phaser';

//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: 1024,
    height: 768,
    parent: 'game-container',
    backgroundColor: '#028af8',
    scene: [
    ]
};

const StartGame = (parent: string) => {

    return new Game({ ...config, parent });

}

document.addEventListener('DOMContentLoaded', () => {

    StartGame('game-container');

});

