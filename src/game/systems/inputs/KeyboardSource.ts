import * as Phaser from 'phaser';
import { InputSource, RawInput } from './InputSource';


type KeyMap = {
    left: Phaser.Input.Keyboard.Key
    altLeft: Phaser.Input.Keyboard.Key
    right: Phaser.Input.Keyboard.Key
    altRight: Phaser.Input.Keyboard.Key
    sprint: Phaser.Input.Keyboard.Key
    jump: Phaser.Input.Keyboard.Key
    altJump: Phaser.Input.Keyboard.Key
    altJump2: Phaser.Input.Keyboard.Key
    attack: Phaser.Input.Keyboard.Key
    altAttack: Phaser.Input.Keyboard.Key
}

export default class KeyboardSource implements InputSource {
    private keys: KeyMap

    constructor(private scene: Phaser.Scene) {
        const keyboard = scene.input.keyboard
        // keyboard must be present to track keyboard inputs
        if (!keyboard) {
            throw new Error('KeyboardSource requires the keyboard plugin to be enabled')
        }

        // initialized control keys
        const KeyCodes = Phaser.Input.Keyboard.KeyCodes
        this.keys = {
            left: keyboard.addKey(KeyCodes.LEFT),
            altLeft: keyboard.addKey(KeyCodes.A),
            right: keyboard.addKey(KeyCodes.RIGHT),
            altRight: keyboard.addKey(KeyCodes.D),
            sprint: keyboard.addKey(KeyCodes.SHIFT),
            jump: keyboard.addKey(KeyCodes.SPACE),
            altJump: keyboard.addKey(KeyCodes.W),
            altJump2: keyboard.addKey(KeyCodes.UP),
            attack: keyboard.addKey(KeyCodes.F),
            altAttack: keyboard.addKey(KeyCodes.J),
        }

        // stop the browser from scrolling on arrows / space
        keyboard.addCapture([
            KeyCodes.LEFT, KeyCodes.RIGHT, KeyCodes.UP, KeyCodes.DOWN, KeyCodes.SPACE,
        ])
    }

    // implement interface method to output data which can be later used by InputController 
    sample(out: RawInput): void {
        const k = this.keys
        // only change values if left side is falsy
        out.left ||= k.left.isDown || k.altLeft.isDown
        out.right ||= k.right.isDown || k.altRight.isDown
        out.sprint ||= k.sprint.isDown
        out.jump ||= k.jump.isDown || k.altJump.isDown || k.altJump2.isDown
        out.attack ||= k.attack.isDown || k.altAttack.isDown
    }

    destroy(): void {
        const keyboard = this.scene.input.keyboard
        if (!keyboard) return

        for (const key of Object.values(this.keys)) {
            keyboard.removeKey(key)
        }
    }
}
