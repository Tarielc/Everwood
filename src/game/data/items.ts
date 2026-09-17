import type { MeleeAttackConfig } from "../components/MeleeAttack"

/** A single equippable item */
export interface ItemDefinition {
    /** Shown in menus and pickup prompts */
    name: string,
    /** Overlay spritesheet, cut to `CHARACTER_FRAME` and aligned with the player's sheet */
    texture: string,
    /** Damage a swing deals */
    damage: number,
    /** The swing's timing and reach while this is held - left out, it's swung like bare hands */
    swing?: MeleeAttackConfig,
}

/** Every item in the game, keyed by {@link ItemId} */
export const ITEMS = {
    "diamond-sword": {
        name: "Diamond Sword",
        texture: "diamond-sword",
        damage: 150,
        swing: {
            windupMs: 180,
            activeMs: 260,
            cooldownMs: 240,
            bufferMs: 160,
            width: 53,
            height: 64,
            offsetX: -8,
            offsetY: 8,
        }
    },
    "diamond-axe": {
        name: "Diamond Axe",
        texture: "diamond-axe",
        damage: 18,
        swing: {
            windupMs: 180,
            activeMs: 260,
            cooldownMs: 240,
            bufferMs: 160,
            width: 53,
            height: 64,
            offsetX: -8,
            offsetY: 8,
        }
    },
    "diamond-pickaxe": {
        name: "Diamond Pickaxe",
        texture: "diamond-pickaxe",
        damage: 12,
        swing: {
            windupMs: 180,
            activeMs: 260,
            cooldownMs: 240,
            bufferMs: 160,
            width: 53,
            height: 64,
            offsetX: -8,
            offsetY: 8,
        }
    },
} as const satisfies Record<string, ItemDefinition>

/** Keys of {@link ITEMS} - a typo is a compile error, not a blank sprite */
export type ItemId = keyof typeof ITEMS

/** Damage a bare-handed swing deals, when nothing is equipped */
export const UNARMED_DAMAGE:number = 6
