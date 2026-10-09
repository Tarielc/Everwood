import { beforeEach, describe, expect, it, vi } from "vitest"
import { StatusEffectComponent } from "./StatusEffectComponent"
import type { StatModifier } from "./StatusEffectComponent"
import { POWER_UPS } from "../data/powerUps"

// Phaser's browser entry needs a DOM. Use its underlying emitter to test the
// component's real arithmetic and timers in Node without starting a game.
vi.mock("phaser", async () => {
    const { EventEmitter } = await import("eventemitter3")
    return { Events: { EventEmitter } }
})

describe("StatusEffectComponent", () => {
    let effects: StatusEffectComponent

    beforeEach(() => {
        effects = new StatusEffectComponent()
    })

    describe("apply", () => {
        it.each([
            "damage", "speed", "regen"
        ] as const)("leaves the base %s unchanged without effects",
            (stat) => {
            expect(effects.apply(stat, 10)).toBe(10)
            expect(effects.apply(stat, 0)).toBe(0)
        })

        it("sums additive bonuses from different effects, including negative modifiers",
            () => {
                effects.add("first", [
                    { stat: "damage", op: "add", value: 2 },
                    { stat: "damage", op: "add", value: -1 },
                ], 1000)
                effects.add("second", [
                    { stat: "damage", op: "add", value: 3}
                ], 1000)

                expect(effects.apply("damage", 10)).toBe(14)
            }
        )

        it("compounds multipliers from different effects",
            () => {
                effects.add("first", [{ stat: "damage", op: "multiply", value: 1.5 }], 1000)
                effects.add("second", [{ stat: "damage", op: "multiply", value: 2 }], 1000)
                
                expect(effects.apply("damage", 10)).toBe(30)
            }
        )

        it.each([
            false, true
        ])("applies every adidition before multiplication, regardcless of order",
            (reversed) => {
                const groups: StatModifier[][] = [
                    [
                        { stat: "damage", op: "multiply", value: 1.5 },
                        { stat: "damage", op: "add", value: 2 },
                    ],
                    [
                        { stat: "damage", op: "add", value: 3 },
                        { stat: "damage", op: "multiply", value: 2 },
                    ]
                ]

                if (reversed) groups.reverse()

                groups.forEach((modifiers, index) => {
                    effects.add(`buff-${index}`, modifiers, 1000)
                })

                expect(effects.apply("damage", 10)).toBe(45)
            }
        )
        
        it("only applies modifiers for the requested stat",
            () => {
                effects.add("mixed", [
                    { stat: "damage", op: "add", value: 2 },
                    { stat: "damage", op: "multiply", value: 1.5 },
                    { stat: "speed", op: "multiply", value: 1.35 },
                ], 1000)

                expect(effects.apply("damage", 10)).toBe(18)
                expect(effects.apply("speed", 1)).toBe(1.35)
                expect(effects.apply("regen", 0)).toBe(0)
            }
        )

        it("preserves fractionla results instead of rounding them",
            () => {
                effects.add("sped", [
                    { stat: "speed", op: "add", value: 0.1 },
                    { stat: "speed", op: "multiply", value: 1.35 },
                ], 1000)

                expect(effects.apply("speed", 1)).toBeCloseTo(1.485)
            }
        )
        
        it("allows a zero multiplier to cancel the base and additive bonuses",
            () => {
                effects.add("damage", [
                    { stat: "damage", op: "multiply", value: 0 },
                    { stat: "damage", op: "add", value: 2 },
                ], 1000)

                expect(effects.apply("damage", 10)).toBe(0)
            }
        )
        
        it("applies the configured damage, speed and regeneration power ups together",
            () => {
                for(const [id, definition] of Object.entries(POWER_UPS)) {
                    effects.add(id, definition.modifiers, definition.durationMs)
                }

                expect(effects.apply("damage", 10)).toBe(15)
                expect(effects.apply("speed", 1)).toBeCloseTo(1.35)
                expect(effects.apply("regen", 0)).toBe(6)
            }
        )
    })

    describe("refresh effects", () => {
        it("extends the timer for a repeated pickup without stacking it's bonus",
            () =>{
                const modifiers: StatModifier[] = [{ stat: "damage", op: "multiply", value: 1.5 }]
                effects.add("damage", modifiers, 1000)
                effects.update(400)

                const refreshed = effects.add("damage", modifiers, 1000)
                
                expect(refreshed.durationMs).toBe(1000)
                expect(refreshed.remainingMs).toBe(1000)
                expect([...effects.active]).toHaveLength(1)
                expect(effects.apply("damage", 10)).toBe(15)

                effects.update(999)
                expect(effects.apply("damage", 10)).toBe(15)
                effects.update(1)
                expect(effects.apply("damage", 10)).toBe(10)
            }
        )
    })

    it("keeps the remaining duration when a top-up is shorter",
        () => {
            const modifiers: StatModifier[] = [{ stat: "damage", op: "multiply", value: 1.5 }]
            effects.add("damage", modifiers, 1000)
            effects.update(100)

            const refreshed = effects.add("damage", modifiers, 200)

            expect(refreshed.durationMs).toBe(900)
            expect(refreshed.remainingMs).toBe(900)
            expect(effects.apply("damage", 10)).toBe(15)

            effects.update(899)
            expect(effects.apply("damage", 10)).toBe(15)
            effects.update(1)
            expect(effects.apply("damage", 10)).toBe(10)
        }
    )

    it("replaces all old modifiers when refreshing the same effect id",
        () => {
            effects.add("buff", [
                { stat: "damage", op: "multiply", value: 1.5 },
                { stat: "speed", op: "multiply", value: 2 },
            ], 1000)

            effects.add("buff", [{ stat: "damage", op: "add", value: 2 }], 1000)

            expect(effects.apply("damage", 10)).toBe(12)
            expect(effects.apply("speed", 1)).toBe(1)
            expect([...effects.active]).toHaveLength(1)
        }
    )

    describe("removing bonuses", () => {
        it.each([
            { addMs: 500, multiplyMs: 1000, expected: 15 },
            { addMs: 1000, multiplyMs: 500, expected: 12 },
        ])("recalculates to $expected when the shorter of two effects exprites",
            ({ addMs, multiplyMs, expected}) => {
                effects.add("flat", [{stat: "damage", op: "add", value: 2}], addMs)
                effects.add("multiplier", [{ stat: "damage", op: "multiply", value: 1.5 }], multiplyMs)
                expect(effects.apply("damage", 10)).toBe(18)

                effects.update(499)
                expect(effects.apply("damage", 10)).toBe(18)
                effects.update(1)
                expect(effects.apply("damage", 10)).toBe(expected)
                effects.update(500)
                expect(effects.apply("damage", 10)).toBe(10)
            }
        )

        it.each([
            1000, 1500
        ])("removes every exprites bonus after a %i ms frames",
            (dt) => {
                const first = effects.add("flat", [{ stat: "damage", op: "add", value: 2}], 1000)
                const second = effects.add("multiplier", [{ stat: "damage", op: "multiply", value: 1.5}], 1000)

                effects.update(dt)

                expect(effects.apply("damage", 10)).toBe(10)
                expect([...effects.active]).toHaveLength(0)
                expect(first.remainingMs).toBe(0)
                expect(second.remainingMs).toBe(0)
            }
        )

        it("removes only the selected effect's contribution",
            () => {
            effects.add("flat", [{ stat: "damage", op: "add", value: 2 }], 1000)
            effects.add("multiplier", [{ stat: "damage", op: "multiply", value: 1.5 }], 1000)

            effects.remove("flat")

            expect(effects.apply("damage", 10)).toBe(15)
            expect(effects.has("flat")).toBe(false)
            expect(effects.has("multiplier")).toBe(true)
            }
        )

        it("restore every base stat when effects are cleared",
            () => {
                for (const [id, definition] of Object.entries(POWER_UPS)) {
                    effects.add(id, definition.modifiers, definition.durationMs)
                }

                effects.clear()

                expect(effects.apply("damage", 10)).toBe(10)
                expect(effects.apply("speed", 1)).toBe(1)
                expect(effects.apply("regen", 0)).toBe(0)
                expect([...effects.active]).toHaveLength(0)
            }
        )
    })
})
