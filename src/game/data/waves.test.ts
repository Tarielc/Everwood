import { describe, expect, it } from "vitest";
import { countFor, WaveFoeRule } from "./waves";

describe("countFor", () => {
    const rule: WaveFoeRule = {
        foe: "archer",
        firstWave: 3,
        baseCount: 2,
        countPerWave: 0.5,
        maxCount: 4,
    }

    it.each([
        1, 2
    ])("returns 0 before the rule's first wave", (wave) => {
        expect(countFor(rule, wave)).toBe(0)
    })

    it("return the base count on the first wave", () => {
        expect(countFor(rule, rule.firstWave)).toBe(rule.baseCount)
    })

    it.each([
        { wave: 4, expected: 2 },
        { wave: 5, expected: 3 },
        { wave: 6, expected: 3 },
    ])("floor fractional growth to $expected foes on wave $wave", ({ wave, expected }) => {
        expect(countFor(rule, wave)).toBe(expected)
    })

    it.each([
        { wave: 3, expected: 1 },
        { wave: 4, expected: 2 },
        { wave: 5, expected: 2 },
    ])("floors the combined base and growth to $expected on wave $wave", ({ wave, expected }) => {
        expect(countFor({ ...rule, baseCount: 1.75 }, wave)).toBe(expected)
    })

    it.each([
        7, 8, 100
    ])("keeps the count at the cap on wave %i", (wave) => {
        expect(countFor(rule, wave)).toBe(rule.maxCount)
    })

    it.each([
        3, 4, 100
    ])("keeps the base count when the growth is zero on wave %i", (wave) => {
        expect(countFor({...rule, countPerWave: 0}, wave)).toBe(2)
    })

    it.each([
        { wave: 3, expected: 0 },
        { wave: 4, expected: 0 },
        { wave: 5, expected: 1 },
    ])("grows from a zero base to $expected foes on wave $wave", ({ wave, expected }) => {
        expect(countFor({ ...rule, baseCount: 0 }, wave)).toBe(expected)
    })

    it.each([
        0, 1
    ])("caps the basecount at %i on the first wave", (maxCount) => {
        expect(countFor({ ...rule, maxCount }, 3)).toBe(maxCount)
    })
    
    it.each([
        { wave: 4, expected: 1 },
        { wave: 5, expected: 0 },
        { wave: 6, expected: 0 },
    ])("clamps a decreasing count to $expected on wave $wave", ({ wave, expected }) => {
        expect(countFor({ ...rule, countPerWave: -1}, wave)).toBe(expected)
    })
})