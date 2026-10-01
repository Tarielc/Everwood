import * as Phaser from 'phaser';
import { NAME_MAX_LENGTH } from '../data/leaderboard';

/**
 * A text box and a submit button for signing a run, laid over the canvas as real HTML.
 *
 * Phaser has no text input of its own, and a canvas can't raise a phone's on-screen
 * keyboard - an `<input>` can. The form is placed over a slot the scene leaves empty
 * for it, in game pixels, and follows it through every resize and fullscreen change.
 * It goes when the scene that made it shuts down.
 */
export class NameEntry {
    private readonly form: HTMLFormElement
    private readonly input: HTMLInputElement
    private readonly button: HTMLButtonElement
    private readonly error: HTMLParagraphElement

    /**
     * @param scene - Scene the form belongs to - it's removed when this one shuts down
     * @param initialName - What the box starts out holding
     * @param onSubmit - Handed the name as typed when the button or enter is pressed
     */
    constructor(
        private readonly scene: Phaser.Scene,
        initialName: string,
        onSubmit: (name: string) => void,
    ) {
        this.form = document.createElement("form")
        this.form.className = "name-entry"
        this.form.noValidate = true

        this.input = document.createElement("input")
        this.input.type = "text"
        this.input.maxLength = NAME_MAX_LENGTH
        this.input.placeholder = "Your name"
        this.input.setAttribute("autocomplete", "nickname")
        this.input.spellcheck = false
        this.input.enterKeyHint = "send"
        this.input.value = initialName
        this.input.setAttribute("aria-label", "Name for the leaderboard")

        this.button = document.createElement("button")
        this.button.type = "submit"
        this.button.textContent = "Submit"

        this.error = document.createElement("p")
        this.error.className = "name-entry-error"
        this.error.setAttribute("role", "alert")

        this.form.append(this.input, this.button, this.error)

        this.form.addEventListener("submit", event => {
            event.preventDefault()
            onSubmit(this.input.value)
        })

        // Phaser listens for keys on the window and swallows the ones the game binds -
        // space, WASD, the arrows - so typing them into the box would do nothing, or
        // worse, move the menu underneath. Keeping them inside the form stops both
        for (const type of ["keydown", "keyup"] as const) {
            this.form.addEventListener(type, event => event.stopPropagation())
        }

        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy())
    }

    /**
     * Put the form over a slot of the canvas
     *
     * @param x - Left edge of the slot, in game pixels
     * @param y - Top edge of the slot, in game pixels
     * @param width - Width of the slot, in game pixels
     * @param height - Height of the slot, in game pixels
     */
    place(x: number, y: number, width: number, height: number): void {
        const canvas = this.scene.game.canvas

        // going fullscreen moves the canvas into a wrapper Phaser makes for it - the
        // form has to be in there with it, or it's left behind outside the fullscreen view
        const host = canvas.parentElement
        if (host && this.form.parentElement !== host) host.appendChild(this.form)

        // displayScale is game pixels per CSS pixel; the form is fixed, so it's placed
        // in viewport pixels off the canvas's own position on the page
        const bounds = canvas.getBoundingClientRect()
        const { x: perCssX, y: perCssY } = this.scene.scale.displayScale

        this.form.style.left = `${bounds.left + x / perCssX}px`
        this.form.style.top = `${bounds.top + y / perCssY}px`
        this.form.style.width = `${width / perCssX}px`
        this.form.style.height = `${height / perCssY}px`
        // the text is sized off the slot, so it shrinks with the rest of the screen
        this.form.style.fontSize = `${Math.round(height * 0.38 / perCssY)}px`
    }

    /** Lock the form while a submit is in flight, and unlock it again if it fails */
    setBusy(busy: boolean): void {
        this.input.disabled = busy
        this.button.disabled = busy
        this.button.textContent = busy ? "Sending..." : "Submit"
    }

    /** Say what went wrong under the box - an empty message clears it */
    showError(message: string): void {
        this.error.textContent = message
    }

    /** Take the form off the page */
    destroy(): void {
        this.form.remove()
    }
}
