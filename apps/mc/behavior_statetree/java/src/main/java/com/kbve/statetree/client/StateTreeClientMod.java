package com.kbve.statetree.client;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.ingame.HandledScreens;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import org.lwjgl.glfw.GLFW;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Client entry point: KBVE wallet UI + NPC plan overlay. Vehicles come
 * from Immersive Aircraft — the BBModel ship renderer, helm input, and
 * flight HUD were retired with the homegrown ship system.
 */
public class StateTreeClientMod implements ClientModInitializer {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    private static KeyBinding walletKey;

    @Override
    public void onInitializeClient() {
        HandledScreens.register(
                com.kbve.statetree.wallet.WalletScreens.HANDLER_TYPE,
                com.kbve.statetree.wallet.WalletScreen::new);

        com.kbve.statetree.wallet.WalletCapabilityPayload.registerClientCodec();
        PayloadTypeRegistry.playC2S().register(
                com.kbve.statetree.wallet.WalletOpenPayload.ID,
                com.kbve.statetree.wallet.WalletOpenPayload.CODEC);
        PayloadTypeRegistry.playS2C().register(
                com.kbve.statetree.wallet.WalletBalanceSyncPayload.ID,
                com.kbve.statetree.wallet.WalletBalanceSyncPayload.CODEC);
        ClientPlayConnectionEvents.JOIN.register((handler, sender, client) -> {
            if (ClientPlayNetworking.canSend(
                    com.kbve.statetree.wallet.WalletCapabilityPayload.ID)) {
                ClientPlayNetworking.send(
                        new com.kbve.statetree.wallet.WalletCapabilityPayload((byte) 1));
            }
        });
        ClientPlayNetworking.registerGlobalReceiver(
                com.kbve.statetree.wallet.WalletBalanceSyncPayload.ID,
                (payload, context) -> {
                    com.kbve.statetree.wallet.ClientWalletState.set(payload.credits(), payload.khash());
                });

        walletKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
                "key.behavior_statetree.wallet",
                InputUtil.Type.KEYSYM,
                GLFW.GLFW_KEY_K,
                KeyBinding.Category.MISC));

        NpcPlanClient.register();

        ClientTickEvents.END_CLIENT_TICK.register(this::onClientTick);

        LOGGER.info("[StateTree Client] Initialized — wallet UI + NPC plan overlay ready");
    }

    private void onClientTick(MinecraftClient client) {
        if (client.player == null) return;

        while (walletKey != null && walletKey.wasPressed()) {
            if (ClientPlayNetworking.canSend(com.kbve.statetree.wallet.WalletOpenPayload.ID)) {
                ClientPlayNetworking.send(new com.kbve.statetree.wallet.WalletOpenPayload((byte) 1));
            }
        }
    }
}
