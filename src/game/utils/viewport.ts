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
 * Size the game the way Scale.RESIZE does - filling the parent, one game pixel
 * per CSS pixel - except it never gets shorter than `minHeight` game pixels.
 *
 * A phone held sideways is only ~390 CSS pixels tall, which under plain RESIZE
 * shows a stripped view of the level. Below `minHeight` the game is given
 * `minHeight` pixels of height (and the matching width) and the browser draws
 * that canvas down into the parent, so the view keeps its proportions instead
 * of being cropped. Anything at least that tall - desktops, phones in portrait -
 * is left exactly as RESIZE would have it.
 * 
 * We use `ResizeObserver()` which size of an HTML element, instead of window size.
 *
 * Needs the game running with `Scale.NONE`, so Phaser doesn't size the canvas itself.
 *
 * @param game - Game to size
 * @param minHeight - Fewest game pixels of height ever shown
 */
export function fitToParent(game: Phaser.Game, minHeight: number, maxHeight: number): void {
    const scale = game.scale
    const parent = scale.parent as HTMLElement

    const fit = () => {
        const { width, height } = parent.getBoundingClientRect()
        if (width === 0 || height === 0) return

        // CSS pixels per game pixel - 1 on tall screens, below 1 on short ones
        const zoom = Math.min(height / maxHeight, height / minHeight)

        // the canvas has to be its final on-screen size before resize() refreshes,
        // since that's what displayScale - and so every pointer - is measured from
        game.canvas.style.width = `${width}px`
        game.canvas.style.height = `${height}px`

        scale.zoom = zoom
        // fires Scale.Events.RESIZE, whitch triggers onResize listener
        scale.resize(Math.round(width / zoom), Math.round(height / zoom))
    }

    const start = () => {
        fit()

        // catches everything that changes the parent - rotation, the URL bar,
        // fullscreen, a desktop window being dragged
        new ResizeObserver(fit).observe(parent)
    }

    if (game.isBooted) start()
    else game.events.once(Phaser.Core.Events.READY, start)
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
    const handler = () => layout(scale.width, scale.height)

    scale.on(Phaser.Scale.Events.RESIZE, handler)
    // the ScaleManager belongs to the game, not the scene - without this the
    // listener outlives the scene and fires into destroyed objects
    const off = () => scale.off(Phaser.Scale.Events.RESIZE, handler)
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off)

    handler()
    return off
}
