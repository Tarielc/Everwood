import type { AmbienceId, MusicId } from "./audio"
import { ARENA_WAVES, WaveConfig } from "./waves"

/**
 * Every level there is - the id is both the key the map JSON is cached under and the
 * name an exit's `nextLevel` property uses. Spelled out rather than read back off
 * {@link LEVELS}, because a level names another one in {@link LevelDefinition.deathReturnsTo}
 * and a type can't be built out of the thing it is used to describe
 */
export type LevelId = "everwood" | "arena" | "training-grounds"

/** A level the game can be standing in */
export interface LevelDefinition {
    /**
     * The Tiled export, under `public/`. Everything else about a level - where it starts,
     * what stands in it, where it lets out - is authored into the map itself
     */
    url: string,
    /**
     * Endless escalating foe waves, spawned at the map's `FoeSpawnPoint` markers.
     * A level without one only ever holds the foes its map places by hand
     */
    waves?: WaveConfig,
    /**
     * The music bed this level is played under, from `MUSIC`. A level without one is
     * played in whatever was already on - a bed is never cut by a level change
     */
    music?: MusicId,
    /** The room tone underneath it, from `AMBIENCE` - the crowd in an arena, the birds in a wood */
    ambience?: AmbienceId,
    /**
     * Where dying here sends the player. Without one they get back up where they fell,
     * which is what an ordinary level wants; a level you can only be thrown out of
     * names the one that catches them
     */
    deathReturnsTo?: LevelId,
    /**
     * Every foe here hunts from anywhere on the map - an unbounded aggro range, applied
     * over whatever its definition prints. There is no patrolling, no losing interest and
     * no outrunning anything: a foe that spawns is a foe already on its way.
     *
     * For an arena, where the fight is the whole level and a corner to wait in would be
     * a way of not playing it. A level with somewhere to walk to wants its foes minding
     * their own patch instead
     */
    foesAlwaysHunt?: boolean,
}

/** Every level, keyed by {@link LevelId} - a typo is a compile error, not a blank scene */
export const LEVELS:Record<LevelId, LevelDefinition> = {
    everwood: {
        url: "assets/map/map.json",
        music: "wood",
        ambience: "forest",
    },
    // no exit of its own - the way out is dying, which puts the player back in the wood
    arena: {
        url: "assets/map/Arena.json",
        music: "arena",
        ambience: "arena-crowd",
        waves: ARENA_WAVES,
        deathReturnsTo: "arena",
        foesAlwaysHunt: true,
    },
    "training-grounds": {
        url: "assets/map/training-grounds.json",
        music: "arena",
        ambience: "arena-crowd",
        waves: ARENA_WAVES,
    },
}

/** Where a fresh game begins */
export const STARTING_LEVEL:LevelId = "arena"
