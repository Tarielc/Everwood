import * as Phaser from 'phaser';

import { MAP_DIALOGUE, MapDialogueConfig } from '../config/ui';
import { MAP } from '../config/world';
import { MapObject, WorldMap } from '../systems/world/WorldMap';
import { onResize } from '../utils/viewport';

/** One speaker placed in the level */
interface Dialogue {
    /** Where the player has to be standing for it to speak, in world pixels */
    area: Phaser.Geom.Rectangle,
    /** Bubble and text together, placed with the tail's tip at its origin */
    bubble: Phaser.GameObjects.Container,
    /** The bubble's body and tail, redrawn whenever the line is re-wrapped */
    graphics: Phaser.GameObjects.Graphics,
    text: Phaser.GameObjects.BitmapText,
    /** What it says, as authored */
    message: string,
    /** The whole line, already broken into the lines it will end up on */
    line: string,
    /** Whether it's meant to be up - the fade may still be on its way there */
    shown: boolean,
    /** Characters typed so far */
    typed: number,
    typing?: Phaser.Time.TimerEvent,
    tween?: Phaser.Tweens.Tween,
}

/**
 * Speech bubbles the level's characters talk to the player with.
 *
 * Each is a `talkingText` object on the player layer in Tiled, with its line in
 * `textValue`. A point object speaks when the player comes within `radius` of it, and
 * its bubble's tail points down at it - so the point goes at the speaker's head. A
 * rectangle speaks while the player is inside it, from its top-centre.
 *
 * The line is typed out a character at a time while the bubble is up, and starts over
 * every time the player walks back up to it. Like {@link MapHints}, it lives in the world
 * rather than on the camera, so it stays with whoever is speaking.
 */
export class MapDialogue {
    private readonly dialogues: Dialogue[] = []

    /**
     * @param scene - Scene the level is built in
     * @param world - Level whose speakers to place
     * @param config - Look, reach and typing speed
     */
    constructor(
        private readonly scene: Phaser.Scene,
        world: WorldMap,
        private readonly config: MapDialogueConfig = MAP_DIALOGUE,
    ) {
        for (const object of world.dialogues) {
            const message = WorldMap.property<string>(object, MAP.dialogueTextProperty)?.trim()
            if (!message) {
                console.warn(`MapDialogue: "${object.name || object.id}" has no ${MAP.dialogueTextProperty} - skipping it`)
                continue
            }

            this.dialogues.push(this.build(object, message, world))
        }

        // a portrait phone is far narrower than the widest a bubble is allowed to be,
        // so every bubble is re-wrapped and redrawn against the live view
        onResize(scene, width => {
            const maxWidth = Math.min(config.maxWidth, width * config.maxWidthFraction - config.padding * 2)
            for (const dialogue of this.dialogues) this.layout(dialogue, maxWidth)
        })

        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this)
    }

    /**
     * Open the bubbles the player is close to and close the rest. Call once a frame
     *
     * @param player - Whoever is being spoken to; their body's centre is what has to be close
     */
    update(player: Phaser.Physics.Arcade.Sprite): void {
        const body = player.body as Phaser.Physics.Arcade.Body | null
        if (!body) return

        for (const dialogue of this.dialogues) {
            const inside = dialogue.area.contains(body.center.x, body.center.y)
            if (inside === dialogue.shown) continue

            if (inside) this.open(dialogue)
            else this.close(dialogue)
        }
    }

    /**
     * Place a speaker's bubble, hidden until the player comes close. It's drawn by
     * {@link layout}, once the width of the view is known
     *
     * @param object - Dialogue object from the map
     * @param message - What it says
     * @param world - Level it's in, to convert map units to world pixels
     */
    private build(object: MapObject, message: string, world: WorldMap): Dialogue {
        const config = this.config
        const area = world.bounds(object)

        // a point has no area of its own - it reaches out around itself instead
        const isPoint = area.width === 0 && area.height === 0
        const tip = isPoint
            ? { x: area.x, y: area.y }
            : { x: area.centerX, y: area.top }
        if (isPoint) {
            const radius = (WorldMap.property<number>(object, MAP.dialogueRadiusProperty) ?? config.radius) * world.scale
            area.setTo(tip.x - radius, tip.y - radius, radius * 2, radius * 2)
        }

        const graphics = this.scene.add.graphics()
        const text = this.scene.add.bitmapText(0, 0, config.font, "", config.size)
            .setTint(config.tint)

        // everything inside is drawn relative to the tail's tip, at (0, 0)
        const bubble = this.scene.add.container(tip.x, tip.y, [graphics, text])
            .setDepth(config.depth)
            .setAlpha(0)

        return { area, bubble, graphics, text, message, line: message, shown: false, typed: 0 }
    }

    /**
     * Wrap a speaker's line and draw its bubble around it
     *
     * The bubble is sized off the whole line up front and the text is typed into it,
     * so it doesn't grow as the line is written, and a word never jumps to the next
     * line halfway through being typed. Run again on every resize - a line part-way
     * through being typed carries on from where it was
     *
     * @param dialogue - Speaker to lay out
     * @param maxWidth - Width to wrap the line at, in world pixels
     */
    private layout(dialogue: Dialogue, maxWidth: number): void {
        const config = this.config
        const { text, graphics } = dialogue

        // wrapped once against the full line - wrappedText is empty when nothing needed wrapping
        text.setMaxWidth(maxWidth).setText(dialogue.message)
        dialogue.line = text.getTextBounds().wrappedText || dialogue.message
        const width = text.width + config.padding * 2
        const height = text.height + config.padding * 2

        // typed into from here on, already broken into lines. a wrap only ever swaps a
        // space for a line break, so what's been typed so far is the same length either way
        text.setMaxWidth(0).setText(dialogue.line.slice(0, dialogue.typed))

        const left = -width / 2
        const top = -config.tail - height
        text.setPosition(left + config.padding, top + config.padding)

        const tail = new Phaser.Geom.Triangle(-config.tail, -config.tail, config.tail, -config.tail, 0, 0)

        graphics.clear()
        graphics.fillStyle(config.background, config.backgroundAlpha)
        graphics.fillRoundedRect(left, top, width, height, config.cornerRadius)
        graphics.fillTriangleShape(tail)

        graphics.lineStyle(config.borderWidth, config.border, 1)
        graphics.strokeRoundedRect(left, top, width, height, config.cornerRadius)
        // the two slanted sides only - the base would draw a line across the bubble's edge
        graphics.lineBetween(tail.x1, tail.y1, tail.x3, tail.y3)
        graphics.lineBetween(tail.x2, tail.y2, tail.x3, tail.y3)
    }

    /**
     * Fade a bubble in and type its line out from the start
     *
     * @param dialogue - Speaker to open
     */
    private open(dialogue: Dialogue): void {
        this.fade(dialogue, true)

        dialogue.typing?.remove()
        dialogue.typed = 0
        dialogue.text.setText("")

        dialogue.typing = this.scene.time.addEvent({
            delay: 1000 / this.config.charsPerSecond,
            repeat: dialogue.line.length - 1,
            callback: () => {
                dialogue.typed++
                dialogue.text.setText(dialogue.line.slice(0, dialogue.typed))
            },
        })
    }

    /**
     * Stop typing and fade a bubble out. What was typed stays up for the fade
     *
     * @param dialogue - Speaker to close
     */
    private close(dialogue: Dialogue): void {
        dialogue.typing?.remove()
        dialogue.typing = undefined
        this.fade(dialogue, false)
    }

    /**
     * Ease a bubble in or out, from wherever its last fade left it
     *
     * @param dialogue - Speaker to fade
     * @param show - `true` to fade in, `false` to fade out
     */
    private fade(dialogue: Dialogue, show: boolean): void {
        dialogue.shown = show
        dialogue.tween?.stop()
        dialogue.tween = this.scene.tweens.add({
            targets: dialogue.bubble,
            alpha: show ? 1 : 0,
            // scaled by how far it has to go, so turning back halfway doesn't take a full fade
            duration: this.config.fadeMs * Math.abs((show ? 1 : 0) - dialogue.bubble.alpha),
        })
    }

    /** Destructor and cleanup - runs on its own when the scene shuts down */
    destroy(): void {
        for (const dialogue of this.dialogues) {
            dialogue.typing?.remove()
            dialogue.tween?.stop()
            dialogue.bubble.destroy()
        }
        this.dialogues.length = 0
    }
}
