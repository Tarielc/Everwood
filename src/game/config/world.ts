import { SCALE_FACTOR } from "./display"

/**
 * The map is drawn at the same scale as the characters standing on it, so a 32px tile
 * and the player's art stay in proportion. Everything the map hands back - spawn points,
 * object markers - is already multiplied by this, so the rest of the game only deals in
 * world pixels
 */
export const MAP_SCALE:number = SCALE_FACTOR

/** How `WorldMap` reads a Tiled export - the names and properties the maps are authored with */
export const MAP = {
    /**
     * Where tileset sheets and backdrops live, next to the maps that name them. They are
     * queued off the map data rather than listed by hand, and keyed by filename, so two
     * levels sharing a sheet share one texture
     */
    assetPath: "assets/map/",
    scale: MAP_SCALE,
    /** Per-tile property that marks a tile solid. */
    collisionProperty: "collides",
    /** Tiled writes it as a bool or a string depending on how the field was authored, so both count */
    collisionValues: [true, "true"],
    /** Object layers authored in tiled, but only one's listed here will be rendered */
    objectLayers: {
        player: "player-object-layer",
        enemies: "enemies-object-layer",
        traps: "traps-object-layer",
    },
    /** Custom property on a layer for render depth */
    depthProperty: "depth",

    /** Object on the player layer where a level starts */
    spawnMarker: "PlayerStartPoint",
    /** Object type/class on the player layer which leads to other level */
    exitType: "PlayerExitpoint",
    /** Property on an exit, naming the `LevelId` it leads to - single level can have multiple exits. One without any, is end of the line. */
    exitLevelProperty: "nextLevel",
    /** Object type/class on the player layer that becomes the respawn point once the player touches it */
    checkpointType: "Checkpoint",
    /** Object type/class on the traps layer that kills the player on touch - spikes and the like */
    hazardType: "Spike",
    /** Object type/class on the enemies layer that spawns a foe */
    foeType: "Foe",
    /** Property naming which `FoeId` to spawn - the object's name is the fallback */
    foeTypeProperty: "foeType",
    /**
     * Object on the enemies layer a wave level pours its foes out of, matched on the
     * object's type or its name. The marker says only where something arrives - what
     * arrives, and how much of it, is the level's wave config, so one marker serves
     * every wave and a map can hold as many of them as it likes
     */
    waveSpawnPoint: "FoeSpawnPoint",
    /**
     * Object type/class on the player layer that shows a line of text over its area while
     * the player stands inside it - how the game teaches its controls
     */
    hintType: "Hint",
    /** Property with what a hint says to a keyboard player */
    hintKeyboardProperty: "keyboard",
    /** Property with what a hint says to a touch player */
    hintTouchProperty: "touch",
    /** Property with what a hint says to anyone - the fallback when the device's own line is missing */
    hintTextProperty: "text",
    /**
     * Property naming the {@link HintAction} that retires a hint for the rest of the level -
     * a "Space to jump" is done with once the player has jumped. Without one, a hint shows
     * every time the player walks in
     */
    hintDismissProperty: "dismissOn",
    /**
     * Object type/class on the player layer that speaks - a speech bubble types its line
     * out while the player is close. A point marks the tip of the bubble's tail, so put it
     * at the speaker's head; a rectangle is spoken from its top-centre instead
     */
    dialogueType: "talkingText",
    /** Property with what a dialogue object says */
    dialogueTextProperty: "textValue",
    /**
     * Property overriding how close the player has to be to a point dialogue, in map
     * pixels. A rectangle ignores it - standing inside the rectangle is what counts
     */
    dialogueRadiusProperty: "radius",
} as const

/** What a hint's {@link MAP.hintDismissProperty} can name */
export type HintAction = "move" | "jump" | "attack" | "sprint"

/** Default depth for a backdrop(background) image layer that doesn't set {@link MAP.depthProperty} */
export const MAP_DEFAULT_BACKDROP_DEPTH:number = -90

/** Default depth for a tile layer that doesn't set {@link MAP.depthProperty} - behind the ground, in front of the backdrops */
export const MAP_DEFAULT_LAYER_DEPTH:number = -40

/** Gravity X for nether dimensions */
export const NETHER_GRAVITY:number = 300

/** How the camera trails the player */
export interface CameraFollowConfig {
    /** How hard the camera pulls towards the player each frame, per axis */
    lerpX: number,
    lerpY: number,
    /**
     * Shifts the camera off the player, positive being up. The ground is near the
     * bottom of the map and everything under it is solid fill, so the view is lifted
     * to trade that dirt for the sky and treeline
     */
    offsetY: number,
}

/** Default camera follow configuration */
export const MAP_CAMERA:CameraFollowConfig = {
    lerpX: 0.12,
    lerpY: 0.08,
    offsetY: 90,
}
