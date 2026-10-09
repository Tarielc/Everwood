import { describe, expect, it } from "vitest"
import { checkArenaScore, cleanName, killRange, MAX_RANKED_WAVE, NAME_MAX_LENGTH } from "./leaderboard"

describe("cleanName", () => {
    it.each([
        ["  Alice  ", "Alice"],
        ["Alice   Smith", "Alice Smith"],
        ["\tAlice\t \r\nSmith\n", "Alice Smith"],
        ["\u00a0Alice\u00a0\u00a0Smith\u00a0", "Alice Smith"],
    ])("normalizes whitespaces in %j to %j", (raw, expected) => {
        expect(cleanName(raw)).toBe(expected)
    })

    it.each([
        ".", "_", "-", "'", '"',
    ])("rejects leading punctutation %j", (prefix) => {
        expect(cleanName(`${prefix}Alice`)).toBeNull()
    })
    
    it.each([
        {label: "undefined", raw: undefined},
        {label: "null", raw: null},
        {label: "a number", raw: 123},
        {label: "a boolean", raw: true },
        {label: "an object", raw: {name: "Alice"} },
        {label: "an array", raw: ["Alice"] },
        {label: "a boxed string", raw: new String("Alice") },
    ])("rejects $label", ({ raw }) => {
        expect(cleanName(raw)).toBeNull()
    })

    it.each([
        "", " ", "\t",
        "\r", "\n", "\u00a0"
    ])("rejects empty or only whitespace string %j", (raw) => {
        expect(cleanName(raw)).toBeNull()
    })

    it.each([
        "Alice!", "@Alice", "Alice/Smith", "Alice\\Smith",
        "Alice😀", "Alic\u200be", "Alic\u0000e"
    ])("rejects unsupported characters in %j", (raw) => {
        expect(cleanName(raw)).toBeNull()
    })

    it.each([
        "Alice", "A", "123", "CaPsLocK", "ტარიელი", "Alice Smiths",
        "Alice.Smith", "Alice_smith", "0'Neil", "Alice-smith",
        "A ._'-"
    ])("accept valid name %j", (name) => {
        expect(cleanName(name)).toBe(name)
    })
    
    it.each([
        { label: "ASCII letter", letter: "A"},
        { label: "supplementary Unicode letter", letter: "𐐀"}
    ])("enforces the character limit for $label", ({ letter }) => {
        const name = letter.repeat(NAME_MAX_LENGTH)

        expect(cleanName(name)).toBe(name)
        expect(cleanName(name + letter)).toBeNull()
    })

    it("measures length after trimming and collapsing whitespace", () => {
        const prefix = "a".repeat(NAME_MAX_LENGTH - 2)

        expect(cleanName(` \t${prefix}   B\n `)).toBe(`${prefix} B`)
        expect(cleanName(` \t${prefix}   BC\n `)).toBeNull()
    })
})

describe("killRange", () => {
    // The current roster has 1 through 8 foes in waves 1 through 8, then stays at 8.
    // Keep expected totals independent of killRange and foesInWave.
    it.each([
        { wave: 1, min: 0, max: 1 },
        { wave: 2, min: 1, max: 3 },
        { wave: 3, min: 3, max: 6 },
        { wave: 4, min: 6, max: 10 },
        { wave: 5, min: 10, max: 15 },
        { wave: 6, min: 15, max: 21 },
        { wave: 7, min: 21, max: 28 },
        { wave: 8, min: 28, max: 36 },
        { wave: 9, min: 36, max: 44 },
        { wave: 20, min: 124, max: 132 },
        { wave: 99, min: 756, max: 764 },
        { wave: MAX_RANKED_WAVE, min: 764, max: 772 },
    ])("returns $min to $max kills for wave $wave", ({ wave, min, max }) => {
        expect(killRange(wave)).toEqual({ min, max })
    })
})

describe("checkArenaScore", () => {
    const scoreError = "Malformed score"
    const nameError = `Names are 1-${NAME_MAX_LENGTH} letters, digits, spaces or . _ ' -`
    const waveError = "Impossible wave"
    const killError = "Impossible kill count"
    it.each([
        {label: "undefined", input: undefined },
        {label: "null", input: null },
        {label: "a number", input: 123},
        {label: "a boolean", input: true },
        {label: "a string", input: "abc"},
    ])("rejects $label as malformed score", ({ input }) => {
        expect(checkArenaScore(input)).toEqual({ok: false, error: scoreError})
    })

    it.each([
        { label: "an array", input: [], error: nameError },
        { label: "an empty object", input: {}, error: nameError },
        { label: "a missing name", input: { wave: 1, kills: 0 }, error: nameError },
        { label: "a missing wave", input: { name: "Alice", kills: 0 }, error: waveError },
        { label: "missing kills", input: { name: "Alice", wave: 1 }, error: killError },
    ])("rejects $label", ({ input, error }) => {
        expect(checkArenaScore(input)).toEqual({ ok: false, error})
    })

    it.each([
        null, 123, "", " \t\n", "-Alice", "Alice!", "A".repeat(NAME_MAX_LENGTH + 1)
    ])("rejects ivalid name: %j", (name) => {
        expect(checkArenaScore({ name, wave: 1, kills: 0 })).toEqual({ ok: false, error: nameError })
    })

    it.each([
        { label: "null", wave: null },
        { label: "a numeric string", wave: "1" },
        { label: "a boolean", wave: true },
        { label: "an object", wave: {} },
        { label: "an array", wave: [] },
        { label: "a double", wave: 1.5 },
        { label: "NaN", wave: NaN },
        { label: "Infinity", wave: Infinity },
        { label: "-Infinity", wave: -Infinity },
        { label: "a negative number", wave: -1 },
        { label: "zero", wave: 0 },
        { label: "above max", wave: MAX_RANKED_WAVE + 1 },
    ])("rejects invalid wave: $label", ({wave}) => {
        expect(checkArenaScore({name: "Alice", wave, kills: 0})).toEqual({ ok: false, error: waveError})
    })

    it.each([
        { label: "null", kills: null },
        { label: "a numeric string", kills: "1" },
        { label: "a boolean", kills: true },
        { label: "an object", kills: {} },
        { label: "an array", kills: [] },
        { label: "a double", kills: 1.5 },
        { label: "NaN", kills: NaN },
        { label: "Infinity", kills: Infinity },
        { label: "-Infinity", kills: -Infinity },
        { label: "a negative number", kills: -1 },
    ])("rejects invalid kills: $kills", ({ kills }) => {
        expect(checkArenaScore({name: "Alice", wave: 1, kills })).toEqual({ ok: false, error: killError})
    })


    it.each(
        [1, 2, MAX_RANKED_WAVE]
    )("enforces inclusive kill limits on wave %i", (wave) => {
        const { min, max } = killRange(wave)

        for (const kills of [min, max]) {
            const score = { name: "Alice", wave, kills }
            expect(checkArenaScore(score)).toEqual({ ok: true, score })
        }

        for (const kills of [min - 1, max + 1]) {
            expect(checkArenaScore({ name: "Alice", wave, kills })).toEqual({
                ok: false,
                error: killError,
            })
        }
    })

    it("returns a cleaned score without mutating input or retaining extra fields", () => {
        const name = " \tAlice   Smith\n "
        const input = Object.freeze({ name, wave: 2, kills: 2, rank: 1 })

        expect(checkArenaScore(input)).toEqual({
            ok: true,
            score: { name: "Alice Smith", wave: 2, kills: 2 },
        })
        expect(input.name).toBe(name)
    })

    it("Accepts valid score", () => {
        const score = {name: "Alice", wave: 2, kills: 2 }
        expect(checkArenaScore(score)).toEqual({ ok: true, score: score })
    })

    it("Accepts valid score data and removes extra properties", () => {
        const score = {name: "Alice", wave: 2, kills: 2 }
        const badScore = { ...score, extraColumn: "extra data" }
        expect(checkArenaScore(badScore)).toEqual({ ok: true, score: score })
    })
})
