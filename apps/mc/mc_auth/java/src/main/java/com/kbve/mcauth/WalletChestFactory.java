package com.kbve.mcauth;

import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.entity.player.PlayerInventory;
import net.minecraft.inventory.SimpleInventory;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.screen.GenericContainerScreenHandler;
import net.minecraft.screen.NamedScreenHandlerFactory;
import net.minecraft.screen.ScreenHandler;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import org.jetbrains.annotations.Nullable;

import java.text.NumberFormat;
import java.util.Locale;

public final class WalletChestFactory {

    private WalletChestFactory() {}

    public static NamedScreenHandlerFactory build(long credits, long khash) {
        return new NamedScreenHandlerFactory() {
            @Override
            public Text getDisplayName() {
                return Text.literal("Wallet").formatted(Formatting.GOLD);
            }

            @Override
            @Nullable
            public ScreenHandler createMenu(int syncId, PlayerInventory inv, PlayerEntity player) {
                SimpleInventory container = new SimpleInventory(9) {
                    @Override
                    public boolean canPlayerUse(PlayerEntity p) {
                        return true;
                    }
                };

                container.setStack(2, named(Items.GOLD_INGOT,
                        Text.literal("Credits: ").formatted(Formatting.YELLOW)
                                .append(Text.literal(format(credits)).formatted(Formatting.WHITE))));

                container.setStack(4, named(Items.EMERALD,
                        Text.literal("KHash: ").formatted(Formatting.AQUA)
                                .append(Text.literal(format(khash)).formatted(Formatting.WHITE))));

                container.setStack(6, named(Items.WRITABLE_BOOK,
                        Text.literal("Merchant").formatted(Formatting.LIGHT_PURPLE)
                                .append(Text.literal(" (coming soon)").formatted(Formatting.GRAY))));

                return new ReadOnlyGenericChestHandler(syncId, inv, container);
            }
        };
    }

    private static ItemStack named(net.minecraft.item.Item item, Text name) {
        ItemStack stack = new ItemStack(item);
        stack.set(net.minecraft.component.DataComponentTypes.CUSTOM_NAME, name);
        return stack;
    }

    private static String format(long v) {
        return NumberFormat.getInstance(Locale.US).format(v);
    }

    private static final class ReadOnlyGenericChestHandler extends GenericContainerScreenHandler {
        private ReadOnlyGenericChestHandler(int syncId, PlayerInventory inv, SimpleInventory container) {
            super(net.minecraft.screen.ScreenHandlerType.GENERIC_9X1, syncId, inv, container, 1);
        }

        @Override
        public ItemStack quickMove(PlayerEntity player, int slot) {
            return ItemStack.EMPTY;
        }

        @Override
        public void onSlotClick(int slotIndex, int button, net.minecraft.screen.slot.SlotActionType actionType, PlayerEntity player) {
            // swallow all clicks — display-only.
        }
    }
}
