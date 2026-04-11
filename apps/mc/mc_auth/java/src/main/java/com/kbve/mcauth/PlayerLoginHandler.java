package com.kbve.mcauth;

import net.minecraft.server.network.ServerPlayerEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Handles the Fabric {@code ServerPlayConnectionEvents.JOIN} hook for the
 * {@code mc_auth} bridge.
 *
 * <p>On join we submit an asynchronous lookup to the native runtime — the
 * result flows back as a {@code PlayerEvent} drained by
 * {@link AuthEventTicker}, which chats the player and updates the in-memory
 * link status. This handler itself is intentionally thin so the join path
 * stays non-blocking.
 */
public final class PlayerLoginHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger(McAuthMod.MOD_ID);

    private PlayerLoginHandler() {}

    public static void onJoin(ServerPlayerEntity player) {
        if (player == null || !NativeRuntime.isLoaded()) {
            return;
        }

        String uuid = player.getUuidAsString();
        String username = player.getNameForScoreboard();

        try {
            NativeRuntime.authenticate(uuid, username);
        } catch (Throwable t) {
            LOGGER.warn("[{}] authenticate() threw: {}", McAuthMod.MOD_ID, t.getMessage());
            return;
        }

        LinkStatusRegistry.markPending(uuid);
        LOGGER.info(
                "[{}] Player joined — uuid={}, username={}, lookup queued",
                McAuthMod.MOD_ID,
                uuid,
                username);
    }
}
