import * as Phaser from 'phaser';

import { MAP_HINT, MapHintConfig } from '../config/ui';
import { HintAction, MAP } from '../config/world';
import { InputState } from '../systems/inputs/InputController';
import { MapObject, WorldMap } from '../systems/world/WorldMap';
import { onResize } from '../utils/viewport';

/** Whether this frame's input counts as having done each {@link HintAction} */
const PERFORMED: Record<HintAction, (input: InputState) => boolean> = {
    move: input => input.moveLeft || input.moveRight,
    jump: input => input.jumpJustPressed,
    attack: input => input.attackJustPressed,
    sprint: input => input.sprintHeld,
}

/** One hint placed in the level */
interface Hint {
    /** The area the player has to be standing in, in world pixels */
    area: Phaser.Geom.Rectangle,
    text: Phaser.GameObjects.BitmapText,
    /** What retires it for good, if anything does */
    dismissOn: HintAction | null,
    /** Whether it's meant to be up - the fade may still be on its way there */
    shown: boolean,
    /** Retired by doing what it asked - it never comes back this level */
    dismissed: boolean,
    tween?: Phaser.Tweens.Tween,
}

/**
 * The "Space to jump" lines a level teaches its controls with.
 *
 * Each is a `Hint` object on the player layer in Tiled: its rectangle is where the
 * player has to stand for it to show, and its text sits centred just above that
 * rectangle. It says the `keyboard` or the `touch` line depending on which controls
 * are up, falling back to `text`, so one hint serves both.
 *
 * Like {@link TextBanner}, a plain object rather than a scene - it belongs to the level
 * and goes with it. Unlike it, the text lives in the world rather than on the camera,
 * so it reads as part of the place: a sign by the gap, not a line across the screen.
 */
export class MapHints {
    private readonly hints: Hint[] = []

    /**
     * @param scene - Scene the level is built in
     * @param world - Level whose hints to place
     * @param touch - Touch buttons are up, so hints should name those rather than keys
     * @param config - Font, placement and timing
     */
    constructor(
        private readonly scene: Phaser.Scene,
        world: WorldMap,
        touch: boolean,
        private readonly config: MapHintConfig = MAP_HINT,
    ) {
        for (const object of world.hints) {
            const message = messageFor(object, touch)
            if (!message) {
                console.warn(`MapHints: hint "${object.name}" has no text for this device - skipping it`)
                continue
            }

            const area = world.bounds(object)
            const text = scene.add.bitmapText(area.centerX, area.top - config.gap, config.font, message, config.size)
                .setOrigin(0.5, 1)
                .setCenterAlign()
                .setTint(config.tint)
                .setDropShadow(1, 1, config.shadow, 1)
                .setDepth(config.depth)
                .setAlpha(0)

            this.hints.push({ area, text, dismissOn: dismissActionFor(object), shown: false, dismissed: false })
        }

        // a portrait phone is far narrower than the widest a hint is allowed to wrap at,
        // so the wrap follows the live view
        onResize(scene, width => {
            const maxWidth = Math.min(config.maxWidth, width * config.maxWidthFraction)
            for (const hint of this.hints) hint.text.setMaxWidth(maxWidth)
        })

        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this)
    }

    /**
     * Show the hints the player is standing in, hide the rest, and retire any whose
     * action was just performed. Call once a frame, after the input has been sampled
     *
     * @param player - Whoever the hints are for; their body's centre is what has to be inside
     * @param input - This frame's input
     */
    update(player: Phaser.Physics.Arcade.Sprite, input: InputState): void {
        const body = player.body as Phaser.Physics.Arcade.Body | null
        if (!body) return

        for (const hint of this.hints) {
            if (hint.dismissed) continue

            const inside = hint.area.contains(body.center.x, body.center.y)

            // only while it's up - an action done somewhere else isn't the one it taught
            if (inside && hint.shown && hint.dismissOn && PERFORMED[hint.dismissOn](input)) {
                hint.dismissed = true
                this.fade(hint, false)
                continue
            }

            if (inside !== hint.shown) this.fade(hint, inside)
        }
    }

    /**
     * Ease a hint in or out, from wherever its last fade left it
     *
     * @param hint - Hint to fade
     * @param show - `true` to fade in, `false` to fade out
     */
    private fade(hint: Hint, show: boolean): void {
        hint.shown = show
        hint.tween?.stop()
        hint.tween = this.scene.tweens.add({
            targets: hint.text,
            alpha: show ? 1 : 0,
            // scaled by how far it has to go, so walking out halfway through a fade-in
            // doesn't take a full fade to undo
            duration: this.config.fadeMs * Math.abs((show ? 1 : 0) - hint.text.alpha),
        })
    }

    /** Destructor and cleanup - runs on its own when the scene shuts down */
    destroy(): void {
        for (const hint of this.hints) {
            hint.tween?.stop()
            hint.text.destroy()
        }
        this.hints.length = 0
    }
}

/**
 * What a hint says on this device - its own line for the controls that are up, or
 * the shared one when it doesn't have one
 *
 * @param object - Hint object from the map
 * @param touch - Touch buttons are up
 * @returns The line to show, or `null` if it has nothing to say here
 */
function messageFor(object: MapObject, touch: boolean): string | null {
    const own = WorldMap.property<string>(object, touch ? MAP.hintTouchProperty : MAP.hintKeyboardProperty)
    const shared = WorldMap.property<string>(object, MAP.hintTextProperty)

    return own?.trim() || shared?.trim() || null
}

/**
 * The action that retires a hint, if it names one the game knows
 *
 * @param object - Hint object from the map
 * @returns The action, or `null` for a hint that never retires
 */
function dismissActionFor(object: MapObject): HintAction | null {
    const value = WorldMap.property<string>(object, MAP.hintDismissProperty)?.trim().toLowerCase()
    if (!value) return null

    if (value in PERFORMED) return value as HintAction

    console.warn(`MapHints: hint "${object.name}" is dismissed on "${value}", which isn't an action`)
    return null
}
