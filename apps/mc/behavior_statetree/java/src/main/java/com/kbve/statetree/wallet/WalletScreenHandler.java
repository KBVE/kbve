package com.kbve.statetree.wallet;

import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.entity.player.PlayerInventory;
import net.minecraft.screen.ScreenHandler;
import net.minecraft.screen.ScreenHandlerType;

public class WalletScreenHandler extends ScreenHandler {

    private final long credits;
    private final long khash;

    public WalletScreenHandler(int syncId, PlayerInventory inv, WalletScreenData data) {
        super(WalletScreens.HANDLER_TYPE, syncId);
        this.credits = data.credits();
        this.khash = data.khash();
    }

    public WalletScreenHandler(int syncId, PlayerInventory inv) {
        this(syncId, inv, new WalletScreenData(0L, 0L));
    }

    public long getCredits() { return credits; }
    public long getKhash() { return khash; }

    @Override
    public net.minecraft.item.ItemStack quickMove(PlayerEntity player, int slot) {
        return net.minecraft.item.ItemStack.EMPTY;
    }

    @Override
    public boolean canUse(PlayerEntity player) {
        return true;
    }

    public static ScreenHandlerType<WalletScreenHandler> registerType() {
        return null;
    }
}
