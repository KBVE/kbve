package com.kbve.mcauth;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.text.Text;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Handles the Fabric {@code ServerPlayConnectionEvents.JOIN} hook for the
 * {@code mc_auth} bridge.
 *
 * <p>On join we forward the player's UUID + username to the native runtime
 * and log the stub response. The real link flow (link code, Supabase lookup,
 * permission gating) will be driven by {@code PlayerEvent}s polled from
 * {@link NativeRuntime#pollEvents()} in a tick handler added later.
 */
public final class PlayerLoginHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger(McAuthMod.MOD_ID);
    private static final Gson GSON = new Gson();

    private PlayerLoginHandler() {}

    public static void onJoin(ServerPlayerEntity player) {
        if (player == null) {
            return;
        }
        if (!NativeRuntime.isLoaded()) {
            return;
        }

        String uuid = player.getUuidAsString();
        String username = player.getGameProfile().getName();

        String responseJson;
        try {
            responseJson = NativeRuntime.authenticate(uuid, username);
        } catch (Throwable t) {
            LOGGER.warn("[{}] authenticate() threw: {}", McAuthMod.MOD_ID, t.getMessage());
            return;
        }

        String status = "unknown";
        boolean linked = false;
        try {
            JsonObject response = GSON.fromJson(responseJson, JsonObject.class);
            if (response != null) {
                if (response.has("status")) {
                    status = response.get("status").getAsString();
                }
                if (response.has("linked")) {
                    linked = response.get("linked").getAsBoolean();
                }
            }
        } catch (Exception e) {
            LOGGER.warn(
                    "[{}] Failed to parse auth response JSON for {}: {}",
                    McAuthMod.MOD_ID,
                    username,
                    e.getMessage()
            );
        }

        LOGGER.info(
                "[{}] Player joined — uuid={}, username={}, status={}, linked={}",
                McAuthMod.MOD_ID,
                uuid,
                username,
                status,
                linked
        );

        player.sendMessage(
                Text.of("\u00A7e[MC Auth] \u00A77Welcome " + username
                        + " — link your account at https://kbve.com/auth"),
                false
        );
    }
}
