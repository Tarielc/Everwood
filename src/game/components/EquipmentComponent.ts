import * as Phaser from 'phaser';
import { WeaponDefinition, WeaponId, WEAPONS, UNARMED_DAMAGE, UNARMED_KNOCKBACK, UNARMED_KNOCKBACK_LIFT } from '../data/weapons';
import { ATLAS } from '../config/atlas';
import { PLAYER_FRAME_PREFIX } from '../data/animations';

export const EquipmentEvent = {
    Equipped: "equipment-equipped",
    Unequipped: "equipment-unequipped",
} as const

export type EquipmentEventName = typeof EquipmentEvent[keyof typeof EquipmentEvent]

export interface EquipmentOptions {
    // how far above the owner the weapon draws - 1 keeps it just in front, no more
    depthOffset?: number
    // start of the owner's atlas frame names, before the pose - what gets swapped for the weapon's
    ownerFramePrefix?: string
}

/**
 * Draws an equipped weapon as a second sprite layered over its owner.
 *
 * Weapon frames are drawn in the hand position for every frame of the character's,
 * and named the same way in the atlas (`<prefix><pose>-<n>.png`), so keeping them
 * in sync is a matter of translating the owner's frame name across. That means no second set of registered
 * animations, no attachment points, and no chance of the two drifting apart -
 * whatever the owner is doing, the weapon is already doing it.
 */
export class EquipmentComponent extends Phaser.Events.EventEmitter {
    private overlay: Phaser.GameObjects.Sprite | null = null
    private current: WeaponDefinition | null = null
    private currentId: WeaponId | null = null

    private readonly depthOffset: number
    private readonly ownerFramePrefix: string

    constructor(
        private owner: Phaser.Physics.Arcade.Sprite,
        options: EquipmentOptions = {},
    ) {
        super()
        this.depthOffset = options.depthOffset ?? 1
        this.ownerFramePrefix = options.ownerFramePrefix ?? PLAYER_FRAME_PREFIX
    }

    // swapping straight from one weapon to another reuses the same sprite
    equip(id: WeaponId): WeaponDefinition {
        const weapon = WEAPONS[id]

        if (!this.overlay) {
            this.overlay = this.owner.scene.add.sprite(this.owner.x, this.owner.y, ATLAS)
            this.overlay.setOrigin(this.owner.originX, this.owner.originY)
        }

        this.current = weapon
        this.currentId = id

        // land on the owner's current pose immediately, so the weapon doesn't spend
        // a frame at the sheet's origin before the first sync
        this.sync()

        this.emit(EquipmentEvent.Equipped, weapon, id)
        return weapon
    }

    unequip(): WeaponDefinition | null {
        const previous = this.current
        if (!previous) return null

        this.overlay?.destroy()
        this.overlay = null
        this.current = null
        this.currentId = null

        this.emit(EquipmentEvent.Unequipped, previous)
        return previous
    }

    // call after the owner's animation has advanced for the frame
    update(): void {
        this.sync()
    }

    // mirror the owner's damage flash onto the weapon, so the two read as one figure
    flash(color: number, mode: Phaser.TintModes = Phaser.TintModes.FILL): void {
        this.overlay?.setTint(color).setTintMode(mode)
    }

    clearFlash(): void {
        this.overlay?.clearTint().setTintMode(Phaser.TintModes.MULTIPLY)
    }

    get weapon(): WeaponDefinition | null {
        return this.current
    }

    get weaponId(): WeaponId | null {
        return this.currentId
    }

    get isEquipped(): boolean {
        return this.current !== null
    }

    // what a swing hits for right now - bare hands still do something
    get damage(): number {
        return this.current?.damage ?? UNARMED_DAMAGE
    }

    // how hard a swing shoves what it hits, and how far up
    get knockback(): number {
        return this.current?.knockback ?? UNARMED_KNOCKBACK
    }

    get knockbackLift(): number {
        return this.current?.knockbackLift ?? UNARMED_KNOCKBACK_LIFT
    }

    destroy(): void {
        this.overlay?.destroy()
        this.overlay = null
        this.current = null
        this.currentId = null
        this.removeAllListeners()
    }

    private sync(): void {
        const overlay = this.overlay
        const weapon = this.current
        if (!overlay || !weapon) return

        const owner = this.owner
        overlay.setPosition(owner.x, owner.y)
        overlay.setScale(owner.scaleX, owner.scaleY)
        overlay.setFlipX(owner.flipX)
        overlay.setAlpha(owner.alpha)
        overlay.setVisible(owner.visible)
        overlay.setDepth(owner.depth + this.depthOffset)

        // the frame name is the whole synchronisation mechanism
        const frame = this.weaponFrame(owner.frame.name, weapon)
        if (!frame || overlay.frame.name === frame) return

        // a weapon with fewer frames than the character would throw here - hold the
        // last good frame instead, so a half-finished asset doesn't take the game down
        if (overlay.texture.has(frame)) overlay.setFrame(frame)
    }

    /**
     * The weapon's frame for one of the owner's, e.g. `player/player-swing-3.png`
     * to `diamond-sword/diamond-sword-attack-3.png`
     *
     * @returns the weapon frame name, or `null` if the owner's frame isn't one of its poses
     */
    private weaponFrame(ownerFrame: string, weapon: WeaponDefinition): string | null {
        if (!ownerFrame.startsWith(this.ownerFramePrefix)) return null

        // "swing-3.png" - the pose is everything before the last dash
        const rest = ownerFrame.slice(this.ownerFramePrefix.length)
        const dash = rest.lastIndexOf("-")
        if (dash < 0) return null

        const pose = rest.slice(0, dash)
        return weapon.framePrefix + (weapon.poseAliases?.[pose] ?? pose) + rest.slice(dash)
    }
}
