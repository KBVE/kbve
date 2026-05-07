package com.kbve.statetree.ship;

import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.entity.player.PlayerInventory;
import net.minecraft.inventory.Inventory;
import net.minecraft.inventory.SimpleInventory;
import net.minecraft.item.BlockItem;
import net.minecraft.item.ItemStack;
import net.minecraft.screen.ScreenHandler;
import net.minecraft.screen.ScreenHandlerType;
import net.minecraft.screen.slot.Slot;

/**
 * ScreenHandler for the ship GUI. Slot grid:
 *
 * <pre>
 *   row 1:  [U U U U]   [B]   [W W W W]
 *   row 2:  [storage 4x4]
 *   row 3:  player inv 9x3 + hotbar
 * </pre>
 *
 * Slot-type filters are enforced via {@link Slot#canInsert}.
 */
public class ShipScreenHandler extends ScreenHandler {

    public static final int INV_SLOTS = ShipInventory.TOTAL_SLOTS;

    private final Inventory shipInv;

    /** Server-side constructor — uses the actual ShipInventory. */
    public ShipScreenHandler(int syncId, PlayerInventory playerInv, Inventory shipInv) {
        super(typeOrNull(), syncId);
        checkSize(shipInv, INV_SLOTS);
        this.shipInv = shipInv;
        shipInv.onOpen(playerInv.player);

        layoutSlots(playerInv);
    }

    /** Client-side constructor — backed by an empty SimpleInventory; vanilla syncs slots. */
    public ShipScreenHandler(int syncId, PlayerInventory playerInv) {
        this(syncId, playerInv, new SimpleInventory(INV_SLOTS));
    }

    private static ScreenHandlerType<ShipScreenHandler> typeOrNull() {
        return ShipScreenHandlerTypes.SHIP;
    }

    private void layoutSlots(PlayerInventory playerInv) {
        // Top row: 4 upgrades, 1 banner, 4 weapons.
        int y0 = 18;
        for (int i = 0; i < ShipInventory.UPGRADE_COUNT; i++) {
            final int idx = ShipInventory.UPGRADE_START + i;
            addSlot(new Slot(shipInv, idx, 8 + i * 18, y0) {
                @Override
                public boolean canInsert(ItemStack stack) {
                    return ShipUpgrades.isUpgrade(stack.getItem());
                }
            });
        }
        addSlot(new Slot(shipInv, ShipInventory.BANNER_SLOT, 88, y0) {
            @Override
            public boolean canInsert(ItemStack stack) {
                return stack.getItem() instanceof BlockItem bi
                        && bi.getBlock() instanceof net.minecraft.block.AbstractBannerBlock;
            }
        });
        for (int i = 0; i < ShipInventory.WEAPON_COUNT; i++) {
            final int idx = ShipInventory.WEAPON_START + i;
            addSlot(new Slot(shipInv, idx, 116 + i * 18, y0) {
                @Override
                public boolean canInsert(ItemStack stack) {
                    return ShipWeapons.isWeapon(stack.getItem());
                }
            });
        }

        // Storage 4x4 below.
        int sX0 = 62;
        int sY0 = 44;
        for (int row = 0; row < 4; row++) {
            for (int col = 0; col < 4; col++) {
                addSlot(new Slot(shipInv,
                        ShipInventory.STORAGE_START + row * 4 + col,
                        sX0 + col * 18, sY0 + row * 18));
            }
        }

        // Player inventory 3x9.
        int pY0 = 126;
        for (int row = 0; row < 3; row++) {
            for (int col = 0; col < 9; col++) {
                addSlot(new Slot(playerInv, col + row * 9 + 9,
                        8 + col * 18, pY0 + row * 18));
            }
        }
        // Hotbar.
        for (int col = 0; col < 9; col++) {
            addSlot(new Slot(playerInv, col, 8 + col * 18, pY0 + 58));
        }
    }

    @Override
    public ItemStack quickMove(PlayerEntity player, int slotIndex) {
        Slot slot = this.slots.get(slotIndex);
        if (!slot.hasStack()) return ItemStack.EMPTY;

        ItemStack original = slot.getStack();
        ItemStack moved = original.copy();

        if (slotIndex < INV_SLOTS) {
            // Ship → player inventory.
            if (!insertItem(original, INV_SLOTS, slots.size(), true)) return ItemStack.EMPTY;
        } else {
            // Player → ship; route by item type to the right slot range.
            if (ShipUpgrades.isUpgrade(original.getItem())) {
                if (!insertItem(original,
                        ShipInventory.UPGRADE_START,
                        ShipInventory.UPGRADE_START + ShipInventory.UPGRADE_COUNT,
                        false)) {
                    return tryStorage(original);
                }
            } else if (original.getItem() instanceof BlockItem bi
                    && bi.getBlock() instanceof net.minecraft.block.AbstractBannerBlock) {
                if (!insertItem(original,
                        ShipInventory.BANNER_SLOT,
                        ShipInventory.BANNER_SLOT + 1,
                        false)) {
                    return tryStorage(original);
                }
            } else if (ShipWeapons.isWeapon(original.getItem())) {
                if (!insertItem(original,
                        ShipInventory.WEAPON_START,
                        ShipInventory.WEAPON_START + ShipInventory.WEAPON_COUNT,
                        false)) {
                    return tryStorage(original);
                }
            } else {
                if (!insertItem(original,
                        ShipInventory.STORAGE_START,
                        ShipInventory.STORAGE_START + ShipInventory.STORAGE_COUNT,
                        false)) {
                    return ItemStack.EMPTY;
                }
            }
        }

        if (original.isEmpty()) slot.setStack(ItemStack.EMPTY); else slot.markDirty();
        return moved;
    }

    private ItemStack tryStorage(ItemStack original) {
        if (!insertItem(original,
                ShipInventory.STORAGE_START,
                ShipInventory.STORAGE_START + ShipInventory.STORAGE_COUNT,
                false)) {
            return ItemStack.EMPTY;
        }
        return original;
    }

    @Override
    public boolean canUse(PlayerEntity player) {
        return shipInv.canPlayerUse(player);
    }

    @Override
    public void onClosed(PlayerEntity player) {
        super.onClosed(player);
        shipInv.onClose(player);
    }

}
