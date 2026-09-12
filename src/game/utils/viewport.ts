import * as Phaser from 'phaser';

/** Space kept clear of notches, rounded corners and the home bar, in game pixels */
export interface SafeArea {
    top: number
    right: number
    bottom: number
    left: number
}

// a hidden element padded by the env() insets - the browser resolves them into
// plain pixels on it, which is the only way to read them from script
let probe: HTMLDivElement | null = null

function insetProbe(): HTMLDivElement {
    if (probe) return probe

    probe = document.createElement("div")
    probe.style.cssText = [
        "position: fixed", "visibility: hidden", "pointer-events: none",
        "padding-top: env(safe-area-inset-top)",
        "padding-right: env(safe-area-inset-right)",
        "padding-bottom: env(safe-area-inset-bottom)",
        "padding-left: env(safe-area-inset-left)",
    ].join(";")
    document.body.appendChild(probe)
    return probe
}

/**
 * Current safe-area insets, converted from CSS pixels into game pixels.
 *
 * All zero on devices without a notch, and on desktop.
 */
export function safeArea(scale: Phaser.Scale.ScaleManager): SafeArea {
    const style = getComputedStyle(insetProbe())
    // displayScale is game pixels per CSS pixel
    const { x, y } = scale.displayScale

    return {
        top: (parseFloat(style.paddingTop) || 0) * y,
        right: (parseFloat(style.paddingRight) || 0) * x,
        bottom: (parseFloat(style.paddingBottom) || 0) * y,
        left: (parseFloat(style.paddingLeft) || 0) * x,
    }
}

/**
 * Run `layout` now and again every time the game size changes, until the scene shuts down.
 *
 * Under Scale.EXPAND the visible area grows past the 1280x720 design size, so
 * anything pinned to a screen edge has to be placed from the live size.
 *
 * @returns A function that removes the listener early.
 */
export function onResize(
    scene: Phaser.Scene,
    layout: (width: number, height: number) => void,
): () => void {
    const scale = scene.scale
    const handler = () => layout(scale.width, scale.height)

    scale.on(Phaser.Scale.Events.RESIZE, handler)
    // the ScaleManager belongs to the game, not the scene - without this the
    // listener outlives the scene and fires into destroyed objects
    const off = () => scale.off(Phaser.Scale.Events.RESIZE, handler)
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off)

    handler()
    return off
}

/**
 * Go fullscreen and lock to landscape where the browser allows it.
 *
 * Must be called from inside a user gesture (a pointerup handler). Android
 * Chrome honours both; iOS Safari supports neither, so the rotate overlay in
 * index.html is what covers it there.
 */
export function enterImmersive(scene: Phaser.Scene): void {
    const scale = scene.scale
    if (!scene.sys.game.device.input.touch) return

    if (scale.fullscreen.available && !scale.isFullscreen) {
        scale.startFullscreen()
    }

    // lock() is missing from TypeScript's DOM types, and throws outside fullscreen
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
    orientation.lock?.("landscape").catch(() => { /* not supported - the overlay handles it */ })
}
