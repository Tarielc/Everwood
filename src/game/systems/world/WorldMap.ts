/**
 * Dynamic world map loading, built on Tiled's JSON map export.
 * 
 * Phaser's tilemap API cover the tile layers themselves, but it has no idea
 * about where sheets come from, what counts as solid, what is layer depth,
 * what backdrop image layers scroll factor are, etc.
 * This module fills those gaps, so level is entitely designed in Tiled
 * and code only has to name it.
 * 
 * - {@link loadMapDefitions} cached every map's JSON (BootScene)
 * - {@link loadMapImages} reads that cached JSON back and queues sheets and backdrops (Preload)
 * - {@link WorldMap} turn one cached level map into an actual world: live layers, backdrops, bounds, etc.
 */
import * as Phaser from 'phaser';
import { onResize } from '../../utils/viewport';

import {
    LEVELS,
    LevelId,
    MAP,
    MAP_DEFAULT_BACKDROP_DEPTH,
    MAP_DEFAULT_LAYER_DEPTH,
} from '../../utils/constants';

/**
 * A standing point coordinate, in world pixels
 * Bottom-center of an object. 
 * 
 * Tiled anchors objects by it's top-left corned, while a sprite is positioned
 * by it's center - so placing something needs the the distinction spelled out.
 */
export interface FootPoint {
    x: number,
    y: number,
}

/** Shorthand for Phaser's tiled object type */
export type MapObject = Phaser.Types.Tilemaps.TiledObject

/** 
 * Image layer, flattened out from the map JSON.
 * 
 * Tiled can nest image layers inside a group, which spreads their placement
 * across (`x`,`y`) and (`offsetX`, `offsetY`) inherited from group coordinates and offset.
 * Also opacity and visibility is inherited from group.
 * 
 * This is resolved in {@link readBackdrops}
 * And {@link WorldMap.builtBackdrops} only has to draw it. 
 */
interface BackdropData {
    name: string,
    image: string,
    x: number,
    y: number,
    depth: number,
    parallaxX: number,
    parallaxY: number,
    repeatX: boolean,
    alpha: number,
    visible: boolean,
}

/** 
 * Parts of a tiled map file organized in more accessible and readable way
 * 
 * Phasers caches the raw JSON and only exposes what its own tilemap needs, so image layers
 * and tilesets image paths have to be read off the cached data directly.
 * 
 * This type stores everything this module uses.
 */
interface TiledJson {
    layers: TiledJsonLayer[],
    tilesets: TiledJsonTileset[],
}

/**
 * A layer as Tiled write it - tile layer, image layer, object layer, group.
 * 
 * Almost everything is optional, because Tiled omits defaults.
*/
interface TiledJsonLayer {
    type: string,
    name: string,
    image?: string,
    x?: number,
    y?: number,
    parallaxx?: number,
    parallaxy?: number,
    offsetx?: number,
    offsety?: number,
    opacity?: number,
    visible?: boolean,
    repeatx?: boolean,
    properties?: TiledProperty[],
    layers?: TiledJsonLayer[],
}

/**
 * Single custom property from Tiled
 * 
 * Tiled stores custom properties as an array of these rather than a plain object,
 * which is why reading custom property needs {@link WorldMap.property} instead of a lookup.
 * 
 * `Value` is `unkown` because it's type is defined in Tiled.
*/
interface TiledProperty {
    name: string,
    type?: string,
    value: unknown
}

/** Tileset entry from the map file  */
interface TiledJsonTileset {
    name: string,
    /** A collection of images has none of its own */
    image?: string,
    /** Sheet size is used for a size of stand-in when sheet fails to load {@link standInForMissingSheets} */
    imagewidth?: number,
    imageheight?: number,
}

/**
 * Namespace a tileset texture key.
 * 
 * Textures lives in one flat cache shared with sprites, so an unprefixed key
 * can make tilesets caleed `player` quietly overwrite the player's spritesheet.
 * 
 * Keyed by the image filename rather than by the name map gave to the tileset,
 * so two levels using the same sheet share one texture, while two levels using
 * different sheets can both still call them identical names.
 * 
 * @param image - Tilesheet filename from the map file
 * @returns Namespaced texture key
 */
const tilesetTexture = (image: string): string => `map-tiles:${image}`

/**
 * Namespace a backdrop texture key, on the same reasoning as {@link tilesetTexture}
 * 
 * @param image - Image filename from the map file
 * @returns Namespaces texture key
 */
const backdropTexture = (image: string): string => `map-bg:${image}`

/**
 * Cache every level map's JSON.
 * (Called from {@link BootScene.preload})
 * 
 * All maps are loaded upfront and kept in cache. They are small.
 * {@link loadMapImages} needs to read them and load art we need for the map.
 * 
 * @param loader - loader from the calling scene
 */
export function loadMapDefinitions(loader: Phaser.Loader.LoaderPlugin): void {
    for (const [id, level] of Object.entries(LEVELS)) {
        loader.tilemapTiledJSON(id, level.url)
    }
}

/**
 * Load every tilesets sheet and backdrop image the map names.
 * (Caleed from {@link PreloadScene.preload})
 *  
 * Nothing here is listed by hand, so the maps are the single source of truth.
 * Adding a tilesets or an image layer in Tiled is all it takes to get the art loaded.
 * Because keys are namespaced and on filename, we can avoid loading shared sheets twice.
 * 
 * @param scene - Scene whose loader the art is queued on
 */
export function loadMapImages(scene: Phaser.Scene): void {
    // tracked loaded files, so we can skip duplicates
    const queued = new Set<string>()

    const queue = (key: string, image: string): void => {
        if (queued.has(key)) return

        queued.add(key)
        scene.load.image(key, MAP.assetPath + image)
    }

    // traverse every level
    for (const level of levelIds()) {
        const json = mapJson(scene, level)
        if (!json) continue

        // traverse every tileset and add them in queue namespaced
        for (const tileset of json.tilesets) {
            if (tileset.image) queue(tilesetTexture(tileset.image), tileset.image)
        }

        // traverse every backdrop image and add them in queue namespaced
        for (const backdrop of readBackdrops(json)) {
            queue(backdropTexture(backdrop.image), backdrop.image)
        }
    }

    // Generally if one file doesn't load, it takes whole level down with it
    // so instead we replace file with transparent placeholder
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => standInForMissingSheets(scene))
}

/**
 * Create a transparent stand-in texture for every tilesets sheet that failed to loa,
 * so one missing file doesn't take whole level map down with it.
 * 
 * Phaser throws when a tile layer is built agains a tileset with no texture,
 * which would leave the player staring at an empty scene over a typo. Canvas of
 * the sheet's declared size keeps tile indices lining up, leaves those tiles invisible,
 * and logs which file failed to load.
 * 
 * Runs on loader completion, when it is finally known what did and didn't loaded.
 * 
 * @param scene - Scene whose texture cache the stand-ins are added to
 */
function standInForMissingSheets(scene: Phaser.Scene): void {
    for (const level of levelIds()) {
        for (const tileset of mapJson(scene, level)?.tilesets ?? []) {
            if (!tileset.image) continue

            const key = tilesetTexture(tileset.image)
            if (scene.textures.exists(key)) continue

            console.warn(`WorldMap: missing tileset image "${tileset.image}" - its tiles will not be drawn`)
            // fallback to a transparent tile-sized canvas
            scene.textures.createCanvas(key, tileset.imagewidth ?? 32, tileset.imageheight ?? 32)
        }
    }
}

/**
 * Every level the game knows about
 * 
 * @returns The {@link LEVELS} keys, typed as {@link LevelId}
 */
const levelIds = (): LevelId[] => Object.keys(LEVELS) as LevelId[]

/**
 * One loaded level: it's tile layers, backdrops, bounds and lookups.
 * 
 * Everything is built in the constructor - backdrops first, then tile layers,
 * then world an camera bounds that depend on map's size.
 * 
 * Every coordinate handed out is in world pixels, with {@link scale} already applied,
 * so callers never deal in the map's authored units.
 */
export class WorldMap {
    /** Phaser's tilemap backing this level */
    readonly map: Phaser.Tilemaps.Tilemap

    /** Factor between map's authored pixels and world pixels. */
    readonly scale: number = MAP.scale

    /** Built tuke layers */
    private readonly layers = new Map<string, Phaser.Tilemaps.TilemapLayer>()

    /** Layers holding at least one solid tile - these are layers where colliders should be applied on */
    private readonly solidLayers: Phaser.Tilemaps.TilemapLayer[] = []

    /**
     * Cached raw map data.
     * Kept because the tileset image paths and the image layers are not reachable through Phaser's tilemap.
     */
    private readonly json: TiledJson | null

    /** Backdrops that tile sideways, re-sized to the camera on every resize */
    private readonly repeatingBackdrops: Array<{
        sprite: Phaser.GameObjects.TileSprite,
        parallaxX: number,
        sourceWidth: number,
    }> = []

    /**
     * Builds the level map: backdrops, tile layers, bounds.
     * 
     * @param scene - Sene the level is built into
     * @param level - Which level to build
     */
    constructor(
        private readonly scene: Phaser.Scene,
        readonly level: LevelId,
    ) {
        this.json = mapJson(scene, level)
        this.map = scene.make.tilemap({ key: level })

        this.buildBackdrops()
        this.buildTileLayers()
        this.applyBounds()
    }

    /** level width in world pixels */
    get widthInPixels(): number {
        return this.map.widthInPixels * this.scale
    }

    /** level height in world pixels */
    get heightInPixels(): number {
        return this.map.heightInPixels * this.scale
    }

    /**
     * Lookup up a built tile layer
     * 
     * @param name - Layer name we are looking for
     * @returns The layer object. `undefined` if layer doesn't exist.
     */
    layer(name: string): Phaser.Tilemaps.TilemapLayer | undefined {
        return this.layers.get(name)
    }

    /**
     * Add collider between object and solid map layers
     * 
     * @param target - Object to collide with the world
     * @param onCollide - Callback function on each contact
     * @returns Array of every created collider
     */
    collide(
        target: Phaser.Types.Physics.Arcade.ArcadeColliderType,
        onCollide?: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
    ): Phaser.Physics.Arcade.Collider[] {
        return this.solidLayers.map(layer => this.scene.physics.add.collider(target, layer, onCollide))
    }

    /**
     * Every object on an object layer
     * 
     * @param layerName - Object layer name we are looking objects of
     * @returns The layer's objects. `[]` if the layer is empty or layer doesn't exists.
     * 
     * Empty array is useful to iterate without `null` check
     */
    objects(layerName: string): MapObject[] {
        return this.map.getObjectLayer(layerName)?.objects ?? []
    }

    /**
     * Where a map object's feet belong (in world pixels)
     * 
     * Tiled gives an object it's top-left corned and size. A sprite is place by it's center.
     * This converts the one into the bottom-center point that {@link stand} can seat a sprite on
     * 
     * @param object - Object from an object layer we want to get spawn location  
     * @returns Bottom-center of the object, scaled to world pixels
     */
    foot(object: MapObject): FootPoint {
        return {
            x: ((object.x ?? 0) + (object.width ?? 0) / 2) * this.scale,
            y: ((object.y ?? 0) + (object.height ?? 0)) * this.scale,
        }
    }

    /**
     * Find a named object on an object layer and return its foot point
     * 
     * @param layerName - Object layer ot search 
     * @param objectName - Object name to match
     * @returns It's foot point, or `null` if object doesn't exists.
     */
    marker(layerName: string, objectName: string): FootPoint | null {
        const object = this.objects(layerName).find(o => o.name === objectName)
        return object ? this.foot(object) : null
    }

    /**
     * Where the player starts, or `null` if this level never marked a spawn point. 
     */
    get spawn(): FootPoint | null {
        return this.marker(MAP.objectLayers.player, MAP.spawnMarker) ?? null
    }
    
    /**
     * Objects that exit this level, or `[]` if it has no exit
     * 
     * Returned as the array of row objects rathen a point, because the caller needs
     * it's bounds for an overlap zone and its `nextLevel` propertu to know
     * where the exit leads to 
     */
    get exit(): MapObject[] {
        return this.objects(MAP.objectLayers.player).filter(o => o.type === MAP.exitType)
    }

    /**
     * Add a physics zone covering a map object's footprint
     * 
     * Tiled measures a rectangle from its top-left corner, while a zone is placed
     * by it's center, hence the half-size shift
     * 
     * @param object - Object whose area becomes the zone
     * @returns The zone, with a static body already attached
     */
    zone(object: MapObject): Phaser.GameObjects.Zone {
        const width = (object.width ?? 0) * this.scale
        const height = (object.height ?? 0) * this.scale

        const zone = this.scene.add.zone(
            (object.x ?? 0) * this.scale + width / 2,
            (object.y ?? 0) * this.scale + height / 2,
            width,
            height,
        )

        // static: zone doesn't move and nothing get's to push it around
        this.scene.physics.add.existing(zone, true)

        return zone
    }

    /**
     * Place a sprite so its feet lant on ground
     * 
     * setting the position alone leaves the sprite's center on the point, which sinks it into
     * a ground by half of its height. A body is also usually smaller than the frame and offset
     * within it, so the correction is measured rather than assumed:  position, read where the
     * body actually ended up, lift by the overshoot, then re-seync the bopdy
     * 
     * @param sprite - Sprite to move
     * @param point - Ground point sprite's feet should rest on
     */
    stand(sprite: Phaser.Physics.Arcade.Sprite, point: FootPoint): void {
        sprite.setPosition(point.x, point.y)

        const body = sprite.body as Phaser.Physics.Arcade.Body | null
        if (!body) return

        body.updateFromGameObject()
        sprite.y -= body.bottom - point.y
        body.updateFromGameObject()
    }

    /**
     * Read a Tileds custom property
     * 
     * Tiled writes custom properties as an array of `{name, value}` in the map file,
     * but Phaser hands some of them back as a plain object once parsed - so both shapes
     * are handled rather than guessed at.
     * 
     * Static because what it reads from is plain JSON, which is often inspected before
     * any level exists. {@link readBackdrops} uses it that way.
     * 
     * @typeParam T - Expected value type
     * @param source - Anything carrying Tiled properties
     * @param name - Property to read
     * @returns The value, or `undefined` if can't find property value.
     */
    static property<T = string>(source: {properties?: unknown}, name: string): T | undefined {
        const properties = source.properties

        if (Array.isArray(properties)) {
            const match = properties.find((p: { name?: string }) => p?.name === name)
            return match?.value as T | undefined
        }

        if (properties && typeof properties === 'object') {
            return (properties as Record<string, T>)[name]
        }

        return undefined
    }

    /**
     * Point main camera at the target and bound it to map level
     * 
     * @param target - Target to follow, usually the player
     * @param config - Per-axis follow smoothing, plus a vertical offset to
     *  bias the the view of the target
     */
    follow(
        target: Phaser.GameObjects.GameObject,
        config: { lerpX: number, lerpY: number, offsetY: number },
    ): void {
        const camera = this.scene.cameras.main
        camera.setBounds(0, 0, this.widthInPixels, this.heightInPixels)
        camera.startFollow(target, true, config.lerpX, config.lerpY, 0, config.offsetY)

        // make sure pixels didn't get distorted because of camera movement
        camera.setRoundPixels(true)
    }

    /**
     * Build every tile layer in the map, record each one of them in {@link layers}
     * and if it has a at least one solid tile, also record in {@link solidLayers}
     * 
     * Depth, alpha and visibility all come from the map file, so the draw order
     * of a level is decided in Tiled rather than here.
     */
    private buildTileLayers(): void {
        const tilesets = this.addTilesets()

        for (const data of this.map.layers) {
            const layer = this.map.createLayer(data.name, tilesets, 0, 0)
            // a layer drawn with a tileset that failed to resolve, can come back null
            // warn and keep building rest of the level
            if (!(layer instanceof Phaser.Tilemaps.TilemapLayer)) {
                console.warn(`WorldMap: could not create tile layer "${data.name}"`)
                continue
            }

            const depth = WorldMap.property<number>(data, MAP.depthProperty) ?? MAP_DEFAULT_LAYER_DEPTH
            layer.setScale(this.scale)
            layer.setDepth(depth)
            layer.setAlpha(data.alpha)
            layer.setVisible(data.visible)

            // chech whether layer is solid or not
            layer.setCollisionByProperty({ [MAP.collisionProperty]: MAP.collisionValues })

            this.layers.set(data.name, layer)
            if (layer.filterTiles((tile: Phaser.Tilemaps.Tile) => tile.collides).length > 0) {
                this.solidLayers.push(layer)
            }
        }
    }

    /**
     * Bind each of the map's tilesets to it's loaded texture
     * 
     * The map names its tilesets while the textures are keyed by sheet filename,
     * so the map JSON is what birdges the two. A tilesets whose texture is missing
     * is skipped rather than fatal.
     * 
     * @returns The tilesets that resolved and are ready to draw layers with
     */
    private addTilesets(): Phaser.Tilemaps.Tileset[] {
        const sheets = new Map(
            (this.json?.tilesets ?? [])
                .filter(tileset => tileset.image)
                .map(tileset => [tileset.name, tileset.image as string]),
        )

        const tilesets: Phaser.Tilemaps.Tileset[] = []

        for (const tileset of this.map.tilesets) {
            const image = sheets.get(tileset.name)
            const key = image ? tilesetTexture(image) : null

            if (!key || !this.scene.textures.exists(key)) {
                console.warn(`WorldMap: no texture for tileset "${tileset.name}"`)
                continue
            }

            const added = this.map.addTilesetImage(tileset.name, key)
            if (added) tilesets.push(added)
        }

        return tilesets
    }

    /**
     * Draw the map's image layers as parallax backdrops.
     * 
     * Phaser has no notion of Tiled's image layers, so each is added by hand with
     * the parallax, depth, opacity, and visibility the map authored. 
     */
    private buildBackdrops(): void {
        if (!this.json) return

        for (const data of readBackdrops(this.json)) {
            const key = backdropTexture(data.image)
            if (!this.scene.textures.exists(key)) {
                console.warn(`WorldMap: no texture for backdrop "${data.name}"`)
                continue
            }

            const parallaxX = data.parallaxX ?? 1
            const source = this.scene.textures.get(key).getSourceImage()

            // repeatubg vacjdrios vecines a tukesorite sizes to cover that span
            // a non-repeating one is a plain image at its authored size
            let backdrop: Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite
            if (data.repeatX) {
                const tiled = this.scene.add.tileSprite(0, 0, source.width, source.height, key)
                this.repeatingBackdrops.push({ sprite: tiled, parallaxX, sourceWidth: source.width })
                backdrop = tiled
            } else {
                backdrop = this.scene.add.image(0, 0, key)
            }

            // top-left origin, so the position means the same thing Tiled meant
            backdrop.setOrigin(0, 0)
            backdrop.setPosition(data.x * this.scale, data.y * this.scale)
            backdrop.setScale(this.scale)
            
            backdrop.setScrollFactor(parallaxX, data.parallaxY)
            backdrop.setDepth(data.depth)
            backdrop.setAlpha(data.alpha)
            backdrop.setVisible(data.visible)
        }

        // sized off the camera, which grows and shrinks with the screen under
        // Scale.EXPAND - so it's done again on every resize
        onResize(this.scene, () => this.coverBackdrops())
    }

    /**
     * Stretch each repeating backdrop over everywhere the camera can see.
     */
    private coverBackdrops(): void {
        const camera = this.scene.cameras.main
        const worldWidth = this.map.widthInPixels * this.scale

        for (const { sprite, parallaxX, sourceWidth } of this.repeatingBackdrops) {
            // a backdrop that scrolls slower than the world still has to cover the
            // eveywhere camera can go: it travels parallaxX of the world's scrollable
            // width - so it needs viewport size, plus that much.
            const coverWidth = camera.width + Math.max(0, worldWidth - camera.width) * parallaxX
            sprite.setSize(coverWidth / this.scale + sourceWidth, sprite.height)
        }
    }

    /**
     * Bound physics world and camera to level's size,
     * so nothing walks off the map and view never shows past its edge
     */
    private applyBounds(): void {
        this.scene.physics.world.setBounds(0, 0, this.widthInPixels, this.heightInPixels)
        this.scene.cameras.main.setBounds(0, 0, this.widthInPixels, this.heightInPixels)
    }
}

/**
 * Read the raw map data cached by {@link loadMapDefition}
 *  
 * @param scene - Scene holding the tilemap cache
 * @param level - Level to read 
 * @returns Cached map data, or `null` if it never loaded
 */
function mapJson(scene: Phaser.Scene, level: LevelId): TiledJson | null {
    const entry = scene.cache.tilemap.get(level) as { data?: TiledJson } | undefined
    if (!entry?.data) {
        console.warn(`WorldMap: no map cached for level "${level}"`)
        return null
    }

    return entry.data
}

/**
 * Flatten every image layer in a map into a drawable list.
 * 
 * Tiled nests layers in groups, and group contriputes its own offset, opacity, and visibility
 * which has an effect on everything inside it. Walking the tree accumulates those down each branch,
 * so what comes out is already resolved: absolute position, combined opacity, and visibility that is
 * falkse if any ancestor group was hidden
 * 
 * @param json - Cached map data
 * @returns Flattened backdrops data array
 */
function readBackdrops(json: TiledJson): BackdropData[] {
    const found: BackdropData[] = []

    const walk = (layers: TiledJsonLayer[], x: number, y: number, alpha: number, visible: boolean): void => {
        for (const layer of layers ?? []) {
            // inherited offset from the ancestor group
            const offsetX = x + (layer.offsetx ?? 0)
            const offsetY = y + (layer.offsety ?? 0)
            // opacity compounds down the tree
            const layerAlpha = alpha * (layer.opacity ?? 1)
            // visibility - one hidden ancestor group hides everything in it
            const shown = visible && layer.visible !== false

            if (layer.type === 'group') {
                walk(layer.layers ?? [], offsetX, offsetY, layerAlpha, shown)
                continue
            }

            // we are only concerned with image layers
            if (layer.type !== 'imagelayer' || !layer.image) continue

            const depth = WorldMap.property<number>(layer, MAP.depthProperty) ?? MAP_DEFAULT_BACKDROP_DEPTH
            found.push({
                name: layer.name,
                image: layer.image,
                x: offsetX + (layer.x ?? 0),
                y: offsetY + (layer.y ?? 0),
                depth: depth,
                parallaxX: layer.parallaxx ?? 1,
                parallaxY: layer.parallaxy ?? 1,
                repeatX: layer.repeatx === true,
                alpha: layerAlpha,
                visible: shown,
            })
        }
    }

    // the root layer list inherits nothing: no offset, full opacity, visible
    walk(json.layers, 0, 0, 1, true)

    return found
}
