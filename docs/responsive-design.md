# Responsive Design

The game uses `Phaser.Scale.EXPAND` with the size of 1280x780. `EXPAND` grows the visible area to fill the screen, so `scale.width` and `scale.height` change with the device and window size. Everything placed relative to screen, should be positioned from live size, not 1280x780.

Each scene has its own objects and needs different solutions, but shared helpers are defined in `viewport.ts`.

[Source: viewport.ts](/src/game/utils/viewport.ts)

## Safe Area

On phones with notches, rounded corners or a home part, part of the screen is unsafe for UI. The browser exposes these regions as CSS enviromental variables, but script can't read `env()` directly.

### Inset Probe

`InsetProbe()` creates a hidden `<div>` which acts as a ruler. values from `env(safe-area-inset)` is set as padding on `<div>` element. This makes possible for TypeScript and `getComputedStyle()` read them as plain pixels.

- Element is created on the first use and stored in module-level `probe` variable. If `probe` already exists, we reuse it.
- `pointer-events: none` stops this element from blocking inputs.

### `safeArea(scale)`

Returns current insets of live size as a `SafeArea` object.

The probe gives values in CSS pixels, and functions multiplies them by `scale` to convert them into game pixels.

On desktop and on devices without a notch, every inset is `0`.

## `OnResize(scene, layout)`

Creates event listener on resize which runs `layout(width, height)` every time event is fired. Listener is removed after scene shuts down.

On every resize handler also runs `toffleRotateOverlay()` to show or hide the rotate overlay.

### Usage
|Scene| What it does |
| --- | --- |
| `PreloadScene` | Background size, loading bar, and title centered |
| `MainMenyScene` | Logo and start button centered |
| `TouchSource` | Movement and action buttons distributed |
| `WorldMap` | Stretched backdrops to cover the screen |

## `EnterImmersive(scene)`

Enters fullscreen mode wherever possible and tries to lock screen orientation to landscape. It does nothing on devices without touch input.

Browsers only grant fullscreen on the `pointerdown`:
```ts
startButton.on("pointerup", ()=> {
    enterImmersive(this)
    this.scene.start("GameScene")
})
```

## Orientation

The game is landscape only. There are two layer of handlig:

1. **Lock** - `lockLandscape()` asks the browser to lock the orienntations with `screen.orientation.lock("landscape")`, falling back to Phaser's  `scale.lockOrientation()` for older browsers. It resolves to whether the lock succeeded. The modern API for locking orientation mode only works in fullscreen, so outside it the call fails quietly.
2. **Overlay** - where the lock isn't supported (e.g. iOS Safari), the rotate overlay is displayed, asking player to rotate device. `toggleRotateOverlay()` adds active class to `#rotate-overlay` while `scale.isPortrait`, otherwise it removed the active class.

The overlay markup [index.html](/index.html), and styles [style.css](/public/style.css)

## Adding a Responsive Element
- Create the object at any position
- Call `onResize()` in the scene's `create()`, or object's constructor, and position the object relative to `width` and `height`.
- For UI, use `safeArea()` inset for edges.
- If object can be destroyed before it's scene, keep the returned function and call it in the object's `destroy()`