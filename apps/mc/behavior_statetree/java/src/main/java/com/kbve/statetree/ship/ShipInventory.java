package com.kbve.statetree.ship;

import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.inventory.SimpleInventory;
import net.minecraft.item.ItemStack;

/**
 * Backing inventory for {@link ShipEntity}. Slot layout matches the
 * GUI: 4 upgrades + 1 banner + 4 weapons + 16 cargo storage.
 *
 * <p>Slot semantics are enforced by {@link ShipScreenHandler}'s slot
 * filters; this class only owns the storage + change notifications.
 */
public class ShipInventory extends SimpleInventory {

    public static final int UPGRADE_START = 0;
    public static final int UPGRADE_COUNT = ShipUpgrades.MAX_SLOTS;
    public static final int BANNER_SLOT = UPGRADE_START + UPGRADE_COUNT;
    public static final int WEAPON_START = BANNER_SLOT + 1;
    public static final int WEAPON_COUNT = 4;
    public static final int STORAGE_START = WEAPON_START + WEAPON_COUNT;
    public static final int STORAGE_COUNT = 16;
    /** Boiler-style fuel feed slot (auto-consumes coal / lava buckets when fuel low). */
    public static final int FUEL_SLOT = STORAGE_START + STORAGE_COUNT;
    public static final int TOTAL_SLOTS = FUEL_SLOT + 1;

    private final ShipEntity ship;

    public ShipInventory(ShipEntity ship) {
        super(TOTAL_SLOTS);
        this.ship = ship;
    }

    @Override
    public boolean canPlayerUse(PlayerEntity player) {
        return !ship.isRemoved() && player.squaredDistanceTo(ship) < 64.0;
    }

    @Override
    public void markDirty() {
        super.markDirty();
        ship.onInventoryChanged();
    }

    public boolean isUpgradeSlot(int slot) {
        return slot >= UPGRADE_START && slot < UPGRADE_START + UPGRADE_COUNT;
    }

    public boolean isBannerSlot(int slot) {
        return slot == BANNER_SLOT;
    }

    public boolean isWeaponSlot(int slot) {
        return slot >= WEAPON_START && slot < WEAPON_START + WEAPON_COUNT;
    }

    public boolean isFuelSlot(int slot) {
        return slot == FUEL_SLOT;
    }

    /** Active banner item (or empty). */
    public ItemStack getBanner() {
        return getStack(BANNER_SLOT);
    }

    /** Boiler-fed fuel stack (or empty). */
    public ItemStack getFuelFeed() {
        return getStack(FUEL_SLOT);
    }
}
