/** A level the game can be standing in */
export interface LevelDefinition {
    /**
     * The Tiled export, under `public/`. Everything else about a level - where it starts,
     * what stands in it, where it lets out - is authored into the map itself
     */
    url: string,
}

/**
 * Every level, keyed by {@link LevelId}. The id is both the key the map JSON is cached
 * under and the name an exit's `nextLevel` property uses.
 */
export const LEVELS = {
    everwood: { url: "assets/map/map.json" },
} as const satisfies Record<string, LevelDefinition>

/** Keys of {@link LEVELS} - a typo is a compile error, not a blank scene */
export type LevelId = keyof typeof LEVELS

/** Where a fresh game begins */
export const STARTING_LEVEL:LevelId = "everwood"
