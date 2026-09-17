import * as Phaser from 'phaser';
import { ItemDefinition, ItemId, ITEMS, UNARMED_DAMAGE } from '../data/items';

export const EquipmentEvent = {
    Equipped: "equipment-equipped",
    Unequipped: "equipment-unequipped",
} as const

export type EquipmentEventName = typeof EquipmentEvent[keyof typeof EquipmentEvent]

export interface EquipmentOptions {
    // how far above the owner the item draws - 1 keeps it just in front, no more
    depthOffset?: number
}

/**
 * Draws an equipped item as a second sprite layered over its owner.
 *
 * Item sheets are cut to the same grid as the character sheet and drawn in the
 * hand position for every frame, so keeping them in sync is a matter of copying
 * the owner's frame index across. That means no second set of registered
 * animations, no attachment points, and no chance of the two drifting apart -
 * whatever the owner is doing, the item is already doing it.
 */
export class EquipmentComponent extends Phaser.Events.EventEmitter {
    private overlay: Phaser.GameObjects.Sprite | null = null
    private current: ItemDefinition | null = null
    private currentId: ItemId | null = null

    private readonly depthOffset: number

    constructor(
        private owner: Phaser.Physics.Arcade.Sprite,
        options: EquipmentOptions = {},
    ) {
        super()
        this.depthOffset = options.depthOffset ?? 1
    }

    // swapping straight from one item to another reuses the same sprite
    equip(id: ItemId): ItemDefinition {
        const item = ITEMS[id]

        if (!this.overlay) {
            this.overlay = this.owner.scene.add.sprite(this.owner.x, this.owner.y, item.texture)
            this.overlay.setOrigin(this.owner.originX, this.owner.originY)
        } else {
            this.overlay.setTexture(item.texture)
        }

        this.current = item
        this.currentId = id

        // land on the owner's current pose immediately, so the item doesn't spend
        // a frame at the sheet's origin before the first sync
        this.sync()

        this.emit(EquipmentEvent.Equipped, item, id)
        return item
    }

    unequip(): ItemDefinition | null {
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

    // mirror the owner's damage flash onto the item, so the two read as one figure
    flash(color: number): void {
        this.overlay?.setTint(color).setTintMode(Phaser.TintModes.FILL)
    }

    clearFlash(): void {
        this.overlay?.clearTint().setTintMode(Phaser.TintModes.MULTIPLY)
    }

    get item(): ItemDefinition | null {
        return this.current
    }

    get itemId(): ItemId | null {
        return this.currentId
    }

    get isEquipped(): boolean {
        return this.current !== null
    }

    // what a swing hits for right now - bare hands still do something
    get damage(): number {
        return this.current?.damage ?? UNARMED_DAMAGE
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
        if (!overlay) return

        const owner = this.owner
        overlay.setPosition(owner.x, owner.y)
        overlay.setScale(owner.scaleX, owner.scaleY)
        overlay.setFlipX(owner.flipX)
        overlay.setAlpha(owner.alpha)
        overlay.setVisible(owner.visible)
        overlay.setDepth(owner.depth + this.depthOffset)

        // the frame index is the whole synchronisation mechanism
        const frame = owner.frame.name
        if (overlay.frame.name === frame) return

        // an item sheet shorter than the character sheet would throw here - hold the
        // last good frame instead, so a half-finished asset doesn't take the game down
        if (overlay.texture.has(frame)) overlay.setFrame(frame)
    }
}
