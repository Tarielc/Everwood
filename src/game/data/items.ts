import { MeleeAttackConfig } from "../components/attack/MeleeAttack"
import type { SoundId } from "./audio"

/** A single equippable item */
export interface ItemDefinition {
    /** Shown in menus and pickup prompts */
    name: string,
    /** Overlay spritesheet, cut to `CHARACTER_FRAME` and aligned with the player's sheet */
    texture: string,
    /** Damage a swing deals */
    damage: number,
    /** Shove a hit gives the foe, away from whoever swung */
    knockback: number,
    knockbackLift: number,
    /** The swing's timing and reach while this is held - left out, it's swung like bare hands */
    swing?: MeleeAttackConfig,
    /** What swinging it sounds like, from `SOUNDS` - left out, it sounds like a bare hand */
    swingSound?: SoundId,
}

/** Every item in the game, keyed by {@link ItemId} */
export const ITEMS = {
    "diamond-sword": {
        name: "Diamond Sword",
        texture: "diamond-sword",
        damage: 150,
        knockback: 180,
        knockbackLift: -120,
        swingSound: "player-swing-sword",
        swing: {
            windupMs: 180,
            activeMs: 260,
            cooldownMs: 240,
            bufferMs: 160,
            width: 58,
            height: 44,
            offsetX: -8,
            offsetY: 8,
        }
    },
    "diamond-axe": {
        name: "Diamond Axe",
        texture: "diamond-axe",
        damage: 18,
        knockback: 200,
        knockbackLift: -140,
        swingSound: "player-swing-axe",
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
        knockback: 160,
        knockbackLift: -100,
        // no pick of its own - it is swung like the axe it is shaped like
        swingSound: "player-swing-axe",
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

/** Shove a bare-handed hit gives, when nothing is equipped */
export const UNARMED_KNOCKBACK:number = 100
export const UNARMED_KNOCKBACK_LIFT:number = -60
