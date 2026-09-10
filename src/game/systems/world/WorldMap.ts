import * as Phaser from 'phaser';

import {
    LEVELS,
    LevelId,
    MAP,
    MAP_DEFAULT_BACKDROP_DEPTH,
    MAP_DEFAULT_LAYER_DEPTH,
} from '../../utils/constants';

// where a thing stands, in world pixels - the middle of its base rather than the
// middle of its body, because a marker in Tiled is drawn standing on the floor
// and the sprites that spawn on one are all different heights
export interface FootPoint {
    x: number,
    y: number,
}

// what Phaser's parser gives back for an object placed in Tiled
export type MapObject = Phaser.Types.Tilemaps.TiledObject

// the bits of an image layer this needs, read straight off the raw Tiled json -
// Phaser's own parser drops `repeatx`, and that flag is the difference between a
// backdrop that tiles across the sky and one castle sitting on one hill
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

// only the parts of the Tiled json read here - the tilemap itself is parsed by
// Phaser, this is for the two things it doesn't keep
interface TiledJson {
    layers: TiledJsonLayer[],
    tilesets: TiledJsonTileset[],
}

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

interface TiledProperty {
    name: string,
    type?: string,
    value: unknown
}

interface TiledJsonTileset {
    name: string,
    image?: string, // a collection of images has none of its own
    imagewidth?: number,
    imageheight?: number,
}

// texture keys, namespaced so a tileset can't land on top of a sprite that
// happens to share its name. keyed by the image file rather than by the name a
// map gave it, so two levels that use the same sheet use the same texture, and
// two that use different sheets can still both call theirs "Decor"
const tilesetTexture = (image: string): string => `map-tiles:${image}`
const backdropTexture = (image: string): string => `map-bg:${image}`

// every level's map json, loaded before anything else so the images they name
// can be read off them rather than listed a second time by hand. the files are
// small, and having them all cached is what lets one pass queue the images for
// all of them - the alternative is loading mid-game, on the level change
export function loadMapDefinitions(loader: Phaser.Loader.LoaderPlugin): void {
    for (const [id, level] of Object.entries(LEVELS)) {
        loader.tilemapTiledJSON(id, level.url)
    }
}

// queue every image the levels refer to - tileset sheets and backdrops alike.
// driven off the map data, so redrawing a map in Tiled never means editing a
// list of filenames in here
export function loadMapImages(scene: Phaser.Scene): void {
    // a sheet two levels share is one file and one texture, so an image already
    // spoken for is skipped rather than queued twice
    const queued = new Set<string>()

    const queue = (key: string, image: string): void => {
        if (queued.has(key)) return

        queued.add(key)
        scene.load.image(key, MAP.assetPath + image)
    }

    for (const level of levelIds()) {
        const json = mapJson(scene, level)
        if (!json) continue

        for (const tileset of json.tilesets) {
            if (tileset.image) queue(tilesetTexture(tileset.image), tileset.image)
        }

        for (const backdrop of readBackdrops(json)) {
            queue(backdropTexture(backdrop.image), backdrop.image)
        }
    }

    // one sheet a map names but the folder hasn't got would otherwise take the
    // whole level down with it. stand a blank texture of the right size in its
    // place instead: the tiles that used it come out invisible, and the rest of
    // the map still draws
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => standInForMissingSheets(scene))
}

function standInForMissingSheets(scene: Phaser.Scene): void {
    for (const level of levelIds()) {
        for (const tileset of mapJson(scene, level)?.tilesets ?? []) {
            if (!tileset.image) continue

            const key = tilesetTexture(tileset.image)
            if (scene.textures.exists(key)) continue

            console.warn(`WorldMap: missing tileset image "${tileset.image}" - its tiles will not be drawn`)
            scene.textures.createCanvas(key, tileset.imagewidth ?? 32, tileset.imageheight ?? 32)
        }
    }
}

const levelIds = (): LevelId[] => Object.keys(LEVELS) as LevelId[]

/**
 * The Tiled map as a playable world: the tile layers in their drawing order, the
 * parallax backdrops behind them, the solid tiles a body is stopped by, and the
 * object markers the scene spawns things on.
 *
 * Everything it hands back is in world pixels with MAP.scale already applied, so
 * a scene never has to know the map is drawn larger than it was authored.
 */
export class WorldMap {
    readonly map: Phaser.Tilemaps.Tilemap
    readonly scale: number = MAP.scale

    // by the name Tiled gave them - layers inside a group keep the group as a
    // prefix, e.g. "Decor Group/Decor Back"
    private readonly layers = new Map<string, Phaser.Tilemaps.TilemapLayer>()

    // the ones that ended up with solid tiles on them - the only ones worth
    // hanging a collider off
    private readonly solidLayers: Phaser.Tilemaps.TilemapLayer[] = []

    // the raw json, kept for the two things Phaser's parser doesn't hold on to:
    // which file each tileset came out of, and whether a backdrop repeats
    private readonly json: TiledJson | null

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

    get widthInPixels(): number {
        return this.map.widthInPixels * this.scale
    }

    get heightInPixels(): number {
        return this.map.heightInPixels * this.scale
    }

    // a tile layer by name, for the odd time a scene wants one directly
    layer(name: string): Phaser.Tilemaps.TilemapLayer | undefined {
        return this.layers.get(name)
    }

    // stop something at the solid parts of the world. one collider per solid
    // layer, handed back so a caller that owns a short-lived entity can drop them
    collide(
        target: Phaser.Types.Physics.Arcade.ArcadeColliderType,
        onCollide?: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
    ): Phaser.Physics.Arcade.Collider[] {
        return this.solidLayers.map(layer => this.scene.physics.add.collider(target, layer, onCollide))
    }

    // every object on one of Tiled's object layers, in the order they were placed
    objects(layerName: string): MapObject[] {
        return this.map.getObjectLayer(layerName)?.objects ?? []
    }

    // the middle of an object's base, which is where whatever it marks stands
    foot(object: MapObject): FootPoint {
        return {
            x: ((object.x ?? 0) + (object.width ?? 0) / 2) * this.scale,
            y: ((object.y ?? 0) + (object.height ?? 0)) * this.scale,
        }
    }

    // a named marker's foot position - null when the map hasn't got one, so a
    // caller can fall back rather than spawn at the origin
    marker(layerName: string, objectName: string): FootPoint | null {
        const object = this.objects(layerName).find(o => o.name === objectName)
        return object ? this.foot(object) : null
    }

    // the object that ends the level, if this map has one. where it leads is the
    // map's business, not this class's - it's a property on the object
    get spawn(): FootPoint | null {
        return this.marker(MAP.objectLayers.player, MAP.spawnMarker) ?? null
    }
    get exit(): MapObject | null {
        return this.objects(MAP.objectLayers.player).find(o => o.name === MAP.exitMarker) ?? null
    }

    // a Tiled rectangle as an area the physics world can test against. no art to
    // it - it's somewhere to stand rather than something to look at
    zone(object: MapObject): Phaser.GameObjects.Zone {
        const width = (object.width ?? 0) * this.scale
        const height = (object.height ?? 0) * this.scale

        const zone = this.scene.add.zone(
            (object.x ?? 0) * this.scale + width / 2,
            (object.y ?? 0) * this.scale + height / 2,
            width,
            height,
        )

        // static - a trigger doesn't move, and nothing gets to push it around
        this.scene.physics.add.existing(zone, true)

        return zone
    }

    // stand a body on a point, feet down. a sprite is positioned by its middle,
    // so this measures the body it actually ended up with rather than assuming
    // anything about the art - a fox and the player both land on the floor
    stand(sprite: Phaser.Physics.Arcade.Sprite, point: FootPoint): void {
        sprite.setPosition(point.x, point.y)

        const body = sprite.body as Phaser.Physics.Arcade.Body | null
        if (!body) return

        body.updateFromGameObject()
        sprite.y -= body.bottom - point.y
        body.updateFromGameObject()
    }

    // read a custom property off a Tiled object. Tiled writes these as a list of
    // {name, value} pairs, though some exports flatten them into an object
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

    // point the camera at something and keep it inside the map
    follow(
        target: Phaser.GameObjects.GameObject,
        config: { lerpX: number, lerpY: number, offsetY: number },
    ): void {
        const camera = this.scene.cameras.main
        camera.setBounds(0, 0, this.widthInPixels, this.heightInPixels)
        camera.startFollow(target, true, config.lerpX, config.lerpY, 0, config.offsetY)

        // whole pixels only - a camera stopped between two of them smears the
        // whole tileset
        camera.setRoundPixels(true)
    }

    private buildTileLayers(): void {
        const tilesets = this.addTilesets()

        for (const data of this.map.layers) {
            const layer = this.map.createLayer(data.name, tilesets, 0, 0)
            if (!(layer instanceof Phaser.Tilemaps.TilemapLayer)) {
                console.warn(`WorldMap: could not create tile layer "${data.name}"`)
                continue
            }

            const depth = WorldMap.property<number>(data, MAP.depthProperty) ?? MAP_DEFAULT_LAYER_DEPTH
            layer.setScale(this.scale)
            layer.setDepth(depth)
            layer.setAlpha(data.alpha)
            layer.setVisible(data.visible)

            // a tile is solid because its tileset says so, not because of which
            // layer it was painted on - so every layer is asked, and only the
            // ones that come back with something get a collider
            layer.setCollisionByProperty({ [MAP.collisionProperty]: MAP.collisionValues })

            this.layers.set(data.name, layer)
            if (layer.filterTiles((tile: Phaser.Tilemaps.Tile) => tile.collides).length > 0) {
                this.solidLayers.push(layer)
            }
        }
    }

    // hand every tileset its sheet. Phaser's parsed tilesets keep the name the
    // map gave them but not the file they came from, so the pairing is looked
    // back up in the raw json. one whose image failed to load is left out, and
    // the tiles that used it simply aren't drawn
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

    private buildBackdrops(): void {
        if (!this.json) return

        const camera = this.scene.cameras.main
        const worldWidth = this.map.widthInPixels * this.scale

        for (const data of readBackdrops(this.json)) {
            const key = backdropTexture(data.image)
            if (!this.scene.textures.exists(key)) {
                console.warn(`WorldMap: no texture for backdrop "${data.name}"`)
                continue
            }

            const parallaxX = data.parallaxX ?? 1
            const source = this.scene.textures.get(key).getSourceImage()

            // a backdrop that scrolls slower than the world has to be wider than
            // the view to still be under the camera at the far end of the map -
            // wider by exactly the ground the camera makes up on it
            const coverWidth = camera.width + Math.max(0, worldWidth - camera.width) * parallaxX

            // one whole extra copy of the texture on the end - repeating it is
            // free, and rounding can't open a seam at the far edge of the map
            const backdrop: Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite = data.repeatX
                ? this.scene.add.tileSprite(0, 0, coverWidth / this.scale + source.width, source.height, key)
                : this.scene.add.image(0, 0, key)

            backdrop.setOrigin(0, 0)
            backdrop.setPosition(data.x * this.scale, data.y * this.scale)
            backdrop.setScale(this.scale)
            backdrop.setScrollFactor(parallaxX, 1)
            backdrop.setDepth(data.depth)
            backdrop.setAlpha(data.alpha)
            backdrop.setVisible(data.visible)
        }
    }

    // the map is the world - nothing walks off the end of it
    private applyBounds(): void {
        this.scene.physics.world.setBounds(0, 0, this.widthInPixels, this.heightInPixels)
        this.scene.cameras.main.setBounds(0, 0, this.widthInPixels, this.heightInPixels)
    }
}

// the raw json the loader cached for a level, before Phaser's parser had its
// way with it
function mapJson(scene: Phaser.Scene, level: LevelId): TiledJson | null {
    const entry = scene.cache.tilemap.get(level) as { data?: TiledJson } | undefined
    if (!entry?.data) {
        console.warn(`WorldMap: no map cached for level "${level}"`)
        return null
    }

    return entry.data
}

// walk the layer tree for image layers, groups included, carrying each group's
// offset, opacity and visibility down onto its children the way Tiled does
function readBackdrops(json: TiledJson): BackdropData[] {
    const found: BackdropData[] = []

    const walk = (layers: TiledJsonLayer[], x: number, y: number, alpha: number, visible: boolean): void => {
        for (const layer of layers ?? []) {
            const offsetX = x + (layer.offsetx ?? 0)
            const offsetY = y + (layer.offsety ?? 0)
            const layerAlpha = alpha * (layer.opacity ?? 1)
            const shown = visible && layer.visible !== false

            if (layer.type === 'group') {
                walk(layer.layers ?? [], offsetX, offsetY, layerAlpha, shown)
                continue
            }

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

    walk(json.layers, 0, 0, 1, true)

    return found
}
