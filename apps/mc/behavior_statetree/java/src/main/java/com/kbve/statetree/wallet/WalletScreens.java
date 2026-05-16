package com.kbve.statetree.wallet;

import net.fabricmc.fabric.api.screenhandler.v1.ExtendedScreenHandlerType;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.screen.NamedScreenHandlerFactory;
import net.minecraft.screen.ScreenHandler;
import net.minecraft.screen.ScreenHandlerType;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;
import org.jetbrains.annotations.Nullable;

public final class WalletScreens {

    public static final Identifier HANDLER_ID = Identifier.of("behavior_statetree", "wallet");

    public static ScreenHandlerType<WalletScreenHandler> HANDLER_TYPE;

    private WalletScreens() {}

    public static void register() {
        HANDLER_TYPE = Registry.register(
                Registries.SCREEN_HANDLER,
                HANDLER_ID,
                new ExtendedScreenHandlerType<>(WalletScreenHandler::new, WalletScreenData.PACKET_CODEC));
    }

    public static boolean openCustom(ServerPlayerEntity player, long credits, long khash) {
        if (player == null || HANDLER_TYPE == null) return false;
        WalletScreenData data = new WalletScreenData(credits, khash);
        player.openHandledScreen(new ExtendedFactory(data));
        return true;
    }

    private static final class ExtendedFactory
            implements net.fabricmc.fabric.api.screenhandler.v1.ExtendedScreenHandlerFactory<WalletScreenData> {

        private final WalletScreenData data;

        ExtendedFactory(WalletScreenData data) {
            this.data = data;
        }

        @Override
        public Text getDisplayName() {
            return Text.literal("Wallet");
        }

        @Override
        public WalletScreenData getScreenOpeningData(ServerPlayerEntity player) {
            return data;
        }

        @Override
        @Nullable
        public ScreenHandler createMenu(int syncId, net.minecraft.entity.player.PlayerInventory inv, net.minecraft.entity.player.PlayerEntity player) {
            return new WalletScreenHandler(syncId, inv, data);
        }
    }
}
