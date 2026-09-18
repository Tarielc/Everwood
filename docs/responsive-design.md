# Responsive Design

The game is sized by `fitToParent()`, which behaves like `Phaser.Scale.RESIZE` with a minimum height (see below), so `scale.width` and `scale.height` change with the device and window size. Everything placed relative to screen, should be positioned from live size, not the 1280x720 in the game config.

## `fitToParent(game, minHeight)`

Called once in [main.ts](/src/main.ts), to handle reponsive desing manually - `Scale.NONE` gives us full control over the scaling, no automatic size changing.

Screens with a height of a least `MIN_VIEW_HEIGHT` in CSS pixels, act exactly as `Phaser.Scale.RESIZE` would - 1 game pixel is 1 CSS pixel.

On shorter screens the game gets `MIN_VIEW_HEIGHT` pixels of height, and the browser draws that canvas scaled down. Plain `RESIZE` would crop the top and bottom levels instead and `EXPAND` would display empty space below the game.

A `ResizeObserver()` is a browser API on the parent, and it watches size change of parent element. After detecting a change, we resize `Phaser.Scale` which fires `RESIZE` event and `onResize()` listener is triggered.

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

### Usage
|Scene| What it does |
| --- | --- |
| `PreloadScene` | Background size, loading bar, and title centered |
| `MainMenyScene` | Logo and start button centered and resized |
| `TouchSource` | Movement and action buttons distributed and scaled |
| `WorldMap` | Stretched backdrops to cover the screen |

## Orientation

The game plays in both portrait and landscape; there is no orientation lock or rotate overlay. Portrait uses the screen as-is (narrow and tall view), while landscape on a phone is scaled by `fitToParent()` so the full height of the view stays visible.

## Adding a Responsive Element
- Create the object at any position
- Call `onResize()` in the scene's `create()`, or object's constructor, and position the object relative to `width` and `height`.
- For UI, use `safeArea()` inset for edges.
- If object can be destroyed before it's scene, keep the returned function and call it in the object's `destroy()`