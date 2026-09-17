/** A single equippable item */
export interface ItemDefinition {
    /** Shown in menus and pickup prompts */
    name: string,
    /** Overlay spritesheet, cut to `CHARACTER_FRAME` and aligned with the player's sheet */
    texture: string,
    /** Damage a swing deals */
    damage: number,
}

/** Every item in the game, keyed by {@link ItemId} */
export const ITEMS = {
    "diamond-sword": { name: "Diamond Sword", texture: "diamond-sword", damage: 150 },
    "diamond-axe": { name: "Diamond Axe", texture: "diamond-axe", damage: 18 },
    "diamond-pickaxe": { name: "Diamond Pickaxe", texture: "diamond-pickaxe", damage: 12 },
} as const satisfies Record<string, ItemDefinition>

/** Keys of {@link ITEMS} - a typo is a compile error, not a blank sprite */
export type ItemId = keyof typeof ITEMS

/** Damage a bare-handed swing deals, when nothing is equipped */
export const UNARMED_DAMAGE:number = 6
