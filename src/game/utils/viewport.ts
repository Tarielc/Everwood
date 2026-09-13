import * as Phaser from 'phaser';

/** Space kept clear of notches, rounded corners and the home bar, in game pixels */
export interface SafeArea {
    top: number
    right: number
    bottom: number
    left: number
}

/**
 * A hidden element padded by the env() insets - the browser resolves them into
 * plain pixels on it, which is the only way to read them from script
 * 
 * variable that will hold <div> element which is used as a ruler
 */
let probe: HTMLDivElement | null = null

/**
 * Create a <div> element and use it as a ruler
 * 
 * "Storing" CSS enviromental variables in probes padding
 * so for TypeScript can read values of safe-area-insets
 * 
 * @returns returns the global probe element
 *  creates new one if it doesn't exists
 *  reuse if already exists 
 */
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
 * Get current safe-area-insets - read from CSS and convert into game pixels
 * 
 * @param scale - Game's scale, so we can factor size for our game
 * @returns Safe working area
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
 * Add resize event handlers for the scene
 * 
 * @param scene - Scene we want to listen to resize event
 * @param layout - Function we want to run every time resize event fires
 * @returns cleanup and remove listener on scene shutdown
 */
export function onResize(
    scene: Phaser.Scene,
    layout: (width: number, height: number) => void,
): () => void {
    const scale = scene.scale
    const handler = () => {
        // main function to run (passed as an argument)
        layout(scale.width, scale.height)

        // toogle orientation overlay
        toggleRotateOverlay(scene)
    }
    scale.on(Phaser.Scale.Events.RESIZE, handler)
    // the ScaleManager belongs to the game, not the scene - without this the
    // listener outlives the scene and fires into destroyed objects
    const off = () => scale.off(Phaser.Scale.Events.RESIZE, handler)
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off)

    handler()
    return off
}

/**
 * Go fullscreen and lock `landscape` mode wherever browser allows it
 * 
 * iOS Safari doesn't support `startFullscreen()` so the rotate overlay
 * div in index.html {@link #rotate-overlay} is set to active whenever `portrait`
 * mode is detected and fullscreen can't be locked.
 * 
 * @param scene - Scene to lock
 */
export function enterImmersive(scene: Phaser.Scene): void {
    const scale = scene.scale
    if (!scene.sys.game.device.input.touch) return

    if (scale.fullscreen.available && !scale.isFullscreen) {
        scale.startFullscreen()
    }

    // lock orientation to landscape
    lockLandscape(scene)
}

/**
 * Attempt locking to landscape mode
 *
 * Modern browsers use `screen.orientation.lock()`, which only works in
 * fullscreen and rejects everywhere else. Phaser's `lockOrientation()` only
 * checks the legacy prefixed APIs, so it is kept as a fallback for old browsers.
 *
 * @param scene - Scene we want to lock
 * @returns resolves to true if the lock succeeded, false otherwise
 */
async function lockLandscape(scene: Phaser.Scene): Promise<boolean> {
    // lock() is missing from TypeScript's DOM types
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }

    if (orientation?.lock) {
        try {
            await orientation.lock("landscape")
            return true
        } catch {
            // not supported, or not in fullscreen - the overlay handles it
            return false
        }
    }

    return scene.scale.lockOrientation("landscape")
}
/**
 * Attempts to lock screen, display orientation overlay otherwise
 * 
 * @param scene - Scene to check orientation
 */
function toggleRotateOverlay(scene: Phaser.Scene): void {
    const overlayDiv = document.getElementById("rotate-overlay")
    if(!overlayDiv) return

    const isPortrait = scene.scale.isPortrait

    // we aren't in portrait mode, we don't need overlayDiv to display
    overlayDiv.classList.toggle("active-overlay", isPortrait)
    
    
}