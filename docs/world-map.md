# World Map

`WorldMap` builds a player level map out of a JSON map exported from Tiled. One instance owns one loaded level: backdrops, tile layers, world and camera bounds, methods, and lookups the rest of the game uses to place things in it.

Phaser's tilemap API covers tile layers and nothing else. It has no notion of where tileset sheets come from, which tiles are solid, what order layers draw in, or existance of image layers. `WorldMap` fills those gaps, so a level is designed entirely in Tiled and the code only has to name it.

Every coordinate it hands back is already multiplied by `MAP.scale`, so callers only ever deal in world pixels.

[Source: WorldMap.ts](/src/game/systems/world/WorldMap.ts)

## Loading a Level

Loading happens in three stages, spread across three scenes.

1. **Cache level maps data** — `loadMapDefinition()` in [BootScene.ts:15](/src/game/scenes/BootScene.ts#L15) caches every entry in `LEVELS` as a tilemap JSON. Maps are small, so they are loaded upfront.
2. **Queue the files** — `loadMapImages()` in [PreloadScene.ts:27](/src/game/scenes/PreloadScene.ts#L27) reads that cached JSON and queues every tilesets sheet and backdrop image. Nothing is listed by hand, so the maps are single source of truth.
3. **Build the level** — `GameScene` constructs a `WorldMap` by providing a corresponding `LevelId`. The constructor builds backdrops, tile layer, and world bounds.

Texture keys are namespaces by image filename (`map-tiles:<file>`, `map-bg:<file>`).
Keying on filename rather than on the tileset name means two levels that share a sheet, share one texture, while two levels using different sheets can still give them identical names.

### Missin Sheets

Phaser throws when a tile layer is built and tileset texture doesn't exists. So a single texture failure could bring down the whole level. On loader completion, `standInForMissinSheets()` is invoked, which  creates transparent canvas with same size as sheet's declared size. Warning is logged.

## Changing Levels

Exits are ordinary Tiled objects on the player object layer whose class/type is `MAP.exitType`. `WorldMap.exit` returns them as an array of raw objects. `GameScene.watchForExit()` walks them and for each one registers an overlap zone through `CollisionManager.watchZone()`. On overlap `travelTo()` saves progress and restarts the scene with the new levelId we got from objects custom property `MAP.exitLevelProperty`

A `travelling` guard matters here: the overlap is fired every frame, overlap is detected, and by using `travalling` boolean value, we only get the first overlap, and ignore the rest. An exit without next level property, does nothing. *One level can lead to several others*.

## `MAP` Constants

[`MAP`](/src/game/utils/constants.ts#L466-L498) contains a lot of static/constant data that is later used in code for accessing specific types, custom properties, acceptable values, etc.

- **`assetPath`** - Folder tilesets and images are loaded from.
- **`scale`** - Factor between the map's pixels and world pixels.
- **`collisionProperty`** - Per-tile custom property marking tile as solid/collidable.
- **`collisionValues`** - Values of `collisionProperty` thatn count as solid. Currently accepts both boolean `true` and string `"true"`.
- **`objectsLayers`** - Defines all [acceptable object layer names](/src/game/utils/constants.ts#L478-L483). Rather than dynamically loading objects layers, it is defined here -  this constraint is deliberate, since a handful of well-known layers beat an open-ended set. We restrict amount and naming of object layers in Tiled.
- **`depthProperty`** - Custom for per-layer drawing order.
- **`spawnMarker`** - Name of the player's spawn object (on the player object layer).
- **`exitType`** - Class/type which marks an object as level exit.
- **`exitLevelPropert`** - Property on an exit which stores `LevelId` it leads to.
- **`foeType`** - Class//type which marks an object as a Foe.
- **`foeTypeProperty`** - Property on foe which specifies foe type e.g. `"Archer"` or `"Fox"`.

Depth deserves a note. Neither Phaser, nor Tiled tracks a depth property, and while draw order coul;d be infered from layer order, an explicit property is a safe-lock against layers overlapping in ways the level design didn't intend. Layer without depth property fall back to `MAP_DEFAULT_BACKDROP_DEPTH` (`-90`) or `MAP_DEFAULT_LAYER_DEPTH` (`-40`). **The player is drawn at depth `0`**.

## Tiled Convention for Designing New Levels

**Tile, image, and group layers** — As many as you want, in whatever nesting you want. `WorldMap` walks the tree and builds them dynamically. Loading and building them is handled dynamically in `WorldMap`.

**Object layers** — Must match one of the names defined in [`MAP.objectLayers`](/src/game/utils/constants.ts#L478-L484). *Note that names defined MUST match layer names in Tiled exactly.*

**Depth** — Give every layer the `depth` custom property with number value. Strongly RECOMMENDED; without one, layer falls back to default draw order.

**Backdrops (image layers)** — Set parallax values in Tiled, both axes defaults to `1`. Check or uncheck `repeatX` property, (`repatY` isn't supported). A repeating backdrop is built a a `TileSprite` wide enought to cover everywhere camera can reach. *Note that only image layers support parallax*.

**Collision** — Give tile a custom property of `MAP.collisionProperty` with any value from `MAP.collisionValues`. If a tile layer contains at least one solid tile, whole layer is considered solid and `CollisionManager` adds colliders against it. see [Collision Manager](/docs/collision-manager.md)

**Foes** — Place an object on the enemies object layer with class/type `Foe`, and give it a `foeType` property naming the foe. `GameScene.spawnMapFoes()` spawns one per object; an object whose type doesn't match to a known foe is skipped with a warning.

## Placing Things on the Map

Tiled anchores an object by its top-left corner; a sprite is positioned byu it's center. `foot()` converts the one into the other, returning bottom-center point in the world pixels, and `marker()` looks up names object and returns it's foot point.

`stand()` seats sprite on that point. Setting the position alone sinks the sprite inton the ground by half it's height,and a physics body is usually smalleer than the frame and offset within it, so the correction is measure rather than assumed: position the sprite, read where the body actually landed, lift by the overshoot, re-sync the body.

`zone()` builds static physics zone covering object's footprint, shifted by half its size for the same top-left-versus-center reason.

## Reading Custom Properties

`WorldMap.property<T>()` is the only correct way to read a Tiled custom property. Tiled writes them as an array of `{name, value}` objects, but Phaser hands some of them back as a plain object once parse, so both shapes are handled. It is static because it reads plain JSON, which is often insepected before any level exists - `readBackdrops()` uses it that way.

## Adding New Level

If the map follows conventions defined above, adding it is one entry in [`LEVELS`](/src/game/utils/constants.ts#L456-L459) - an ID and the path to its Tiled export JSON. `LevelId` is derived from the object keyes.

Everything else about a level — where player spawns, what stands in it, how background should look — is authored by exported Tiled map and `WorldMap`.

If the map breaks the conventions, or needs something `WorldMap` doesn't yet support, `WorldMap` is what needs to change.

