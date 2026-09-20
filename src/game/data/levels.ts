import { ARENA_WAVES, WaveConfig } from "./waves"

/**
 * Every level there is - the id is both the key the map JSON is cached under and the
 * name an exit's `nextLevel` property uses. Spelled out rather than read back off
 * {@link LEVELS}, because a level names another one in {@link LevelDefinition.deathReturnsTo}
 * and a type can't be built out of the thing it is used to describe
 */
export type LevelId = "everwood" | "arena"

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
    everwood: { url: "assets/map/map.json" },
    // no exit of its own - the way out is dying, which puts the player back in the wood
    arena: {
        url: "assets/map/Arena.json",
        waves: ARENA_WAVES,
        deathReturnsTo: "arena",
        foesAlwaysHunt: true,
    },
}

/** Where a fresh game begins */
export const STARTING_LEVEL:LevelId = "arena"
