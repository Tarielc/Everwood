import * as Phaser from 'phaser';
import { onResize } from '../utils/viewport';

/** A scene-owned HTML modal with focus handling, input isolation and fullscreen support. */
export class MenuPopup {
    private readonly dialog: HTMLDialogElement

    /**
     * @param scene - Scene that owns and removes the dialog
     * @param className - Class for this popup's content and styling
     * @param titleId - ID of the heading used as the dialog's accessible name
     * @param content - Trusted HTML describing the popup, before its shared dismiss button
     */
    protected constructor(
        private readonly scene: Phaser.Scene,
        className: string,
        titleId: string,
        content: string,
    ) {
        this.dialog = document.createElement("dialog")
        this.dialog.className = `menu-popup ${className}`
        this.dialog.setAttribute("aria-labelledby", titleId)
        this.dialog.innerHTML = `${content}
            <form method="dialog">
                <button type="submit">Got it</button>
            </form>
        `

        // Phaser's window listeners also process mouse/touch events outside the canvas.
        // Stop them here without preventing HTML button actions or native scrolling.
        for (const type of [
            "keydown", "keyup", "pointerdown", "pointerup", "pointermove", "pointercancel",
            "mousedown", "mouseup", "mousemove", "touchstart", "touchend", "touchmove",
            "touchcancel", "wheel", "click",
        ] as const) {
            this.dialog.addEventListener(type, event => event.stopPropagation())
        }

        this.dialog.addEventListener("click", event => {
            if (event.target !== this.dialog) return
            const bounds = this.dialog.getBoundingClientRect()
            if (event.clientX < bounds.left || event.clientX > bounds.right
                || event.clientY < bounds.top || event.clientY > bounds.bottom) {
                this.dialog.close()
            }
        })

        onResize(scene, () => this.attach())
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.dialog.close()
            this.dialog.remove()
        })
    }

    /** Open above the canvas, keeping focus and input inside the modal. */
    open(): void {
        this.attach()
        if (this.dialog.isConnected && !this.dialog.open) this.dialog.showModal()
    }

    /** Follow the canvas into Phaser's fullscreen wrapper. */
    private attach(): void {
        const host = this.scene.game.canvas.parentElement
        if (!host || this.dialog.parentElement === host) return

        // Moving an open dialog removes it from the top layer, so reopen it afterwards.
        const wasOpen = this.dialog.open
        if (wasOpen) this.dialog.close()
        host.appendChild(this.dialog)
        if (wasOpen) this.dialog.showModal()
    }
}
