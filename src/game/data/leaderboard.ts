import type { LevelId } from "./levels"
import { ARENA_WAVES, foesInWave } from "./waves"

/*
 * The arena leaderboard's rules, shared by both ends of it: the game reads them to
 * check a name before sending it, and the API in `api/` imports this same file to
 * check what arrives. Nothing here may pull in Phaser or the DOM - the server has neither.
 */

/** The one level whose runs are ranked */
export const RANKED_LEVEL: LevelId = "arena"

/** How many places the board shows */
export const LEADERBOARD_SIZE = 10

/** Longest name a run can be signed with, in characters */
export const NAME_MAX_LENGTH = 16

/** Deepest wave a submitted run may claim - far past anything playable, only there to bound the maths */
export const MAX_RANKED_WAVE = 100

/** Letters and digits in any script, and spaces, dots, dashes, underscores and apostrophes after the first */
const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._'-]*$/u

/** A finished arena run - what the game sends, and what the board stores */
export interface ArenaScore {
    name: string,
    /** The wave the run ended on, counting from 1 */
    wave: number,
    /** Wave foes that went down on the way there */
    kills: number,
}

/** One row of the board, best first */
export type LeaderboardEntry = ArenaScore

/** What checking a submission comes back with - the cleaned score, or why it was turned away */
export type ScoreCheck =
    | { ok: true, score: ArenaScore }
    | { ok: false, error: string }

/**
 * A name as it will be stored - trimmed, with runs of spaces folded into one
 *
 * @param raw - Whatever was typed
 * @returns The cleaned name, or `null` if it is empty, too long or uses a character that isn't allowed
 */
export function cleanName(raw: unknown): string | null {
    if (typeof raw !== "string") return null

    const name = raw.trim().replace(/\s+/g, " ")
    // counted in characters rather than UTF-16 units, so an accented or CJK name gets the full allowance
    const length = [...name].length

    if (length === 0 || length > NAME_MAX_LENGTH) return null
    if (!NAME_PATTERN.test(name)) return null

    return name
}

/**
 * The fewest and most wave foes a run that ended on `wave` can have killed.
 *
 * A wave only begins once every foe of the one before it is down, so reaching `wave`
 * means all of the earlier waves were killed in full; the wave it ended on can have been
 * anywhere from untouched to cleared.
 *
 * @param wave - The wave the run ended on, counting from 1
 * @returns The inclusive range the run's kills have to fall in
 */
export function killRange(wave: number): { min: number, max: number } {
    let min = 0
    for (let w = 1; w < wave; w++) min += foesInWave(ARENA_WAVES, w)

    return { min, max: min + foesInWave(ARENA_WAVES, wave) }
}

/**
 * Check a run someone wants on the board. A sanity check rather than proof: it turns
 * away anything the game could not have produced, not a made-up run that it could have
 *
 * @param input - The parsed request body, trusted for nothing
 * @returns The cleaned score, or a reason fit to show the player
 */
export function checkArenaScore(input: unknown): ScoreCheck {
    if (typeof input !== "object" || input === null) return { ok: false, error: "Malformed score" }

    const { name: rawName, wave, kills } = input as Record<string, unknown>

    const name = cleanName(rawName)
    if (!name) {
        return { ok: false, error: `Names are 1-${NAME_MAX_LENGTH} letters, digits, spaces or . _ ' -` }
    }

    if (!Number.isInteger(wave) || (wave as number) < 1 || (wave as number) > MAX_RANKED_WAVE) {
        return { ok: false, error: "Impossible wave" }
    }
    if (!Number.isInteger(kills)) return { ok: false, error: "Impossible kill count" }

    const range = killRange(wave as number)
    if ((kills as number) < range.min || (kills as number) > range.max) {
        return { ok: false, error: "Impossible kill count" }
    }

    return { ok: true, score: { name, wave: wave as number, kills: kills as number } }
}
