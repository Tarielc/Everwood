import * as Phaser from 'phaser';

import { MovementController } from "../components/MovementController"
import { PLAYER_MOVEMENT } from '../utils/constants';
import { InputState } from '../systems/InputController';


export default class Player extends Phaser.Physics.Arcade.Sprite {
    private movement: MovementController

    constructor(
        scene: Phaser.Scene,
        x: number,
        y: number,
        texture: string,
        private controls: InputState,
        frame?: string | number
    ) {
        super(scene, x, y, texture, frame);

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setSize(16, 46);
        this.setOffset(32, 18);

        this.movement = new MovementController(this, PLAYER_MOVEMENT);
    }

    update(_time:number, delta: number){
        this.movement.update(this.controls, delta)
    }
}
