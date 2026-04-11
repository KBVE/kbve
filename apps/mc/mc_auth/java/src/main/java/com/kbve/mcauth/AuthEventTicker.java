package com.kbve.mcauth;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Drains {@link NativeRuntime#pollEvents()} on every server tick and
 * dispatches {@code PlayerEvent}s into the in-memory
 * {@link LinkStatusRegistry} and chat messages.
 *
 * <p>The Rust worker serializes its {@code PlayerEvent} enum as an
 * externally-tagged JSON envelope — each element looks like
 * {@code {"AlreadyLinked":{"player_uuid":"...","supabase_user_id":"..."}}}.
 * We inspect the single key at the top level and dispatch accordingly.
 *
 * <p>Behaviour is deliberately non-blocking and graceful:
 * <ul>
 *   <li>Never kick the player — failures are logged server-side only</li>
 *   <li>Unlinked players get a one-time join message plus a periodic nag
 *       every {@link #NAG_TICK_INTERVAL} ticks (~5 min at 20 TPS)</li>
 *   <li>Any JSON parse failure is logged and skipped; it never escapes to
 *       disrupt the server tick loop</li>
 * </ul>
 */
public final class AuthEventTicker {

    private static final Logger LOGGER = LoggerFactory.getLogger(McAuthMod.MOD_ID);
    private static final Gson GSON = new Gson();

    /** Nag every ~5 minutes at 20 TPS. */
    private static final long NAG_TICK_INTERVAL = 20L * 60 * 5;

    /** How many ticks between pollEvents() calls. */
    private static final int POLL_TICK_INTERVAL = 20;

    private static long tickCounter = 0L;

    private AuthEventTicker() {}

    public static void onEndTick(MinecraftServer server) {
        tickCounter++;

        if (tickCounter % POLL_TICK_INTERVAL == 0) {
            drainEvents(server);
        }

        if (tickCounter % NAG_TICK_INTERVAL == 0) {
            nagUnlinkedPlayers(server);
        }
    }

    private static void drainEvents(MinecraftServer server) {
        String json;
        try {
            json = NativeRuntime.pollEvents();
        } catch (Throwable t) {
            LOGGER.warn("[{}] pollEvents() threw: {}", McAuthMod.MOD_ID, t.getMessage());
            return;
        }
        if (json == null || json.isEmpty() || "[]".equals(json)) {
            return;
        }

        JsonArray array;
        try {
            array = GSON.fromJson(json, JsonArray.class);
        } catch (Exception e) {
            LOGGER.warn("[{}] failed to parse pollEvents JSON: {}", McAuthMod.MOD_ID, e.getMessage());
            return;
        }
        if (array == null) {
            return;
        }

        for (JsonElement element : array) {
            if (!element.isJsonObject()) continue;
            JsonObject envelope = element.getAsJsonObject();
            if (envelope.size() != 1) continue;
            String variant = envelope.keySet().iterator().next();
            JsonObject payload = envelope.getAsJsonObject(variant);
            if (payload == null) continue;

            try {
                dispatch(server, variant, payload);
            } catch (Exception e) {
                LOGGER.warn(
                        "[{}] failed to dispatch event {}: {}",
                        McAuthMod.MOD_ID,
                        variant,
                        e.getMessage());
            }
        }
    }

    private static void dispatch(MinecraftServer server, String variant, JsonObject payload) {
        switch (variant) {
            case "AlreadyLinked": {
                String uuid = payload.get("player_uuid").getAsString();
                String userId = payload.get("supabase_user_id").getAsString();
                LinkStatusRegistry.markLinked(uuid, userId);
                ServerPlayerEntity player = findPlayer(server, uuid);
                if (player != null) {
                    player.sendMessage(
                            Text.literal("[KBVE] Welcome back — your account is linked.")
                                    .formatted(Formatting.GREEN),
                            false);
                }
                LOGGER.info("[{}] AlreadyLinked uuid={} user_id={}", McAuthMod.MOD_ID, uuid, userId);
                break;
            }
            case "Unlinked": {
                String uuid = payload.get("player_uuid").getAsString();
                String username = payload.get("username").getAsString();
                LinkStatusRegistry.markUnlinked(uuid);
                ServerPlayerEntity player = findPlayer(server, uuid);
                if (player != null) {
                    sendLinkPrompt(player, username);
                    LinkStatusRegistry.recordNag(uuid, tickCounter);
                }
                LOGGER.info("[{}] Unlinked uuid={} username={}", McAuthMod.MOD_ID, uuid, username);
                break;
            }
            case "LinkVerified": {
                String uuid = payload.get("player_uuid").getAsString();
                String userId = payload.get("supabase_user_id").getAsString();
                LinkStatusRegistry.markLinked(uuid, userId);
                ServerPlayerEntity player = findPlayer(server, uuid);
                if (player != null) {
                    player.sendMessage(
                            Text.literal("[KBVE] Account linked — thanks!")
                                    .formatted(Formatting.GREEN),
                            false);
                }
                LOGGER.info("[{}] LinkVerified uuid={} user_id={}", McAuthMod.MOD_ID, uuid, userId);
                break;
            }
            case "LinkRejected": {
                String uuid = payload.get("player_uuid").getAsString();
                String reason = payload.get("reason").getAsString();
                ServerPlayerEntity player = findPlayer(server, uuid);
                if (player != null) {
                    player.sendMessage(
                            Text.literal("[KBVE] Link failed: " + reason)
                                    .formatted(Formatting.RED),
                            false);
                }
                LOGGER.info("[{}] LinkRejected uuid={} reason={}", McAuthMod.MOD_ID, uuid, reason);
                break;
            }
            case "AuthFailure": {
                String uuid = payload.get("player_uuid").getAsString();
                String reason = payload.get("reason").getAsString();
                // Graceful — do NOT message the player, just log server-side.
                // The worker has already emitted a fallback Unlinked event
                // that the join flow will handle normally.
                LOGGER.warn("[{}] AuthFailure uuid={} reason={}", McAuthMod.MOD_ID, uuid, reason);
                break;
            }
            default:
                LOGGER.debug("[{}] unknown PlayerEvent variant: {}", McAuthMod.MOD_ID, variant);
        }
    }

    private static void nagUnlinkedPlayers(MinecraftServer server) {
        for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
            String uuid = player.getUuidAsString();
            LinkStatusRegistry.Entry entry = LinkStatusRegistry.get(uuid);
            if (entry == null || entry.state != LinkStatusRegistry.State.UNLINKED) {
                continue;
            }
            if (tickCounter - entry.lastNagTick < NAG_TICK_INTERVAL) {
                continue;
            }
            sendLinkPrompt(player, player.getNameForScoreboard());
            LinkStatusRegistry.recordNag(uuid, tickCounter);
        }
    }

    private static void sendLinkPrompt(ServerPlayerEntity player, String username) {
        player.sendMessage(
                Text.literal("[KBVE] Your account isn't linked yet. Visit ")
                        .formatted(Formatting.YELLOW)
                        .append(Text.literal("https://kbve.com/mc").formatted(Formatting.AQUA))
                        .append(Text.literal(" to get a code, then run ").formatted(Formatting.YELLOW))
                        .append(Text.literal("/link <code>").formatted(Formatting.GOLD))
                        .append(Text.literal(".").formatted(Formatting.YELLOW)),
                false);
    }

    private static ServerPlayerEntity findPlayer(MinecraftServer server, String uuid) {
        try {
            return server.getPlayerManager().getPlayer(java.util.UUID.fromString(uuid));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
