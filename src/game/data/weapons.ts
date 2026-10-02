import { MeleeAttackConfig } from "../components/attack/MeleeAttack"
import type { SoundId } from "./audio"

/** A single equippable weapon */
export interface WeaponDefinition {
    /** Shown in menus and pickup prompts */
    name: string,
    /**
     * Atlas frame name of the overlay up to the pose, e.g. `diamond-sword/diamond-sword-`.
     * Its frames are drawn over the player's, pose for pose and frame for frame
     */
    framePrefix: string,
    /** Player poses the overlay names differently, player pose to overlay pose */
    poseAliases?: Readonly<Record<string, string>>,
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

/** Every weapon in the game, keyed by {@link WeaponId} */
export const WEAPONS = {
    "diamond-sword": {
        name: "Diamond Sword",
        framePrefix: "diamond-sword/diamond-sword-",
        poseAliases: { swing: "attack" },
        damage: 150,
        knockback: 120,
        knockbackLift: -90,
        swingSound: "player-swing-sword",
        swing: {
            windupMs: 180,
            activeMs: 260,
            cooldownMs: 240,
            bufferMs: 160,
            width: 58,
            height: 96,
            offsetX: -8,
            offsetY: -20,
        }
    },
} as const satisfies Record<string, WeaponDefinition>

/** Keys of {@link WEAPONS} - a typo is a compile error, not a blank sprite */
export type WeaponId = keyof typeof WEAPONS

/** Damage a bare-handed swing deals, when nothing is equipped */
export const UNARMED_DAMAGE:number = 6

/** Shove a bare-handed hit gives, when nothing is equipped */
export const UNARMED_KNOCKBACK:number = 60
export const UNARMED_KNOCKBACK_LIFT:number = -30
