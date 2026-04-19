package com.kbve.statetree.chat;

import com.kbve.statetree.ChatBridge;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.boss.WitherEntity;
import net.minecraft.entity.boss.dragon.EnderDragonEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.server.network.ServerPlayerEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.atomic.AtomicLong;

/**
 * Wires MC server events to the {@link ChatBridge} IRC client.
 *
 * <p>All outbound events fire on {@code #world-events} with platform
 * {@code "minecraft"}. The bridge is optional — if {@code IRC_HOST} is
 * not set at boot, the handle stays at zero and every event becomes a
 * no-op. This keeps MC startup independent of ergo availability.
 *
 * <h2>Environment variables</h2>
 * <ul>
 *   <li>{@code IRC_HOST} — ergo hostname, e.g.
 *       {@code ergo-irc-service.irc.svc.cluster.local}. Unset → bridge disabled.</li>
 *   <li>{@code IRC_PORT} — default {@code 6667}</li>
 *   <li>{@code IRC_TLS} — {@code "true"} / {@code "1"} to enable TLS</li>
 *   <li>{@code IRC_NICK} — default {@code mc-server}</li>
 *   <li>{@code IRC_PASSWORD} — ergo PASS, or unset for no auth</li>
 *   <li>{@code IRC_CHANNELS} — default {@code #world-events}</li>
 * </ul>
 *
 * <h2>Emitted events</h2>
 * <ul>
 *   <li>{@code kill} — boss entity killed by a player</li>
 *   <li>{@code death} — player death</li>
 *   <li>{@code chat} (optional, future) — in-game chat relay</li>
 * </ul>
 */
public final class McChatEvents {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");
    private static final String PLATFORM = "minecraft";
    private static final String CHANNEL = "#world-events";

    /** Opaque native handle. Zero means the bridge is disabled. */
    private static final AtomicLong HANDLE = new AtomicLong(0);

    private McChatEvents() {}

    /**
     * Register Fabric event listeners and (lazily) establish the IRC
     * connection on server start. Call once from {@code onInitialize}.
     */
    public static void register() {
        // Open the IRC connection when the server starts, not at class
        // load time, so failures don't block mod boot and env vars are
        // evaluated with the container's final environment.
        ServerLifecycleEvents.SERVER_STARTED.register(server -> openConnection());
        ServerLifecycleEvents.SERVER_STOPPING.register(server -> closeConnection());

        // Player death — emit on final death tick.
        ServerLivingEntityEvents.AFTER_DEATH.register((entity, damageSource) -> {
            if (!(entity instanceof ServerPlayerEntity player)) return;
            String cause = damageSource.getName();
            String name = player.getNameForScoreboard();
            emit("death", name, name + " died to " + cause,
                    jsonObject("cause", jsonString(cause)));
        });

        // Boss kill — Wither and Ender Dragon, attributed to the killing player.
        ServerLivingEntityEvents.AFTER_DEATH.register((entity, damageSource) -> {
            boolean isBoss = entity instanceof EnderDragonEntity || entity instanceof WitherEntity;
            if (!isBoss) return;
            if (!(damageSource.getAttacker() instanceof PlayerEntity killer)) return;
            String killerName = killer.getNameForScoreboard();
            String bossName = entityLabel(entity);
            emit("kill", killerName,
                    killerName + " slew the " + bossName,
                    jsonObject("boss", jsonString(bossName)));
        });

        // Player join — optional welcome ping on #world-events.
        ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> {
            ServerPlayerEntity player = handler.getPlayer();
            if (player == null) return;
            String name = player.getNameForScoreboard();
            emit("system", name, name + " joined Minecraft", null);
        });
    }

    // ── Connection lifecycle ─────────────────────────────────────────

    private static void openConnection() {
        String host = System.getenv("IRC_HOST");
        if (host == null || host.isBlank()) {
            LOGGER.info("[chat] IRC_HOST unset — chat bridge disabled");
            return;
        }
        int port = parseIntEnv("IRC_PORT", 6667);
        boolean tls = parseBoolEnv("IRC_TLS", false);
        String nick = envOrDefault("IRC_NICK", "mc-server");
        String password = System.getenv("IRC_PASSWORD"); // null is fine
        String channels = envOrDefault("IRC_CHANNELS", CHANNEL);

        long handle = ChatBridge.connect(host, port, tls, nick, password, channels);
        if (handle == 0L) {
            LOGGER.warn("[chat] IRC connect failed (host={}:{}, nick={}) — chat bridge disabled",
                    host, port, nick);
            return;
        }
        HANDLE.set(handle);
        LOGGER.info("[chat] Connected to IRC {}:{} as {} ({})", host, port, nick, channels);
    }

    private static void closeConnection() {
        long h = HANDLE.getAndSet(0L);
        if (h != 0L) {
            ChatBridge.disconnect(h);
            LOGGER.info("[chat] IRC disconnected");
        }
    }

    // ── Emit helper ──────────────────────────────────────────────────

    /**
     * Send an event to IRC if the bridge is active. Failures are logged
     * at debug level — IRC problems must not disrupt gameplay.
     */
    private static void emit(String kind, String sender, String content, String payloadJson) {
        long h = HANDLE.get();
        if (h == 0L) return;
        try {
            boolean ok = ChatBridge.send(h, kind, sender, PLATFORM, CHANNEL, content, payloadJson);
            if (!ok) {
                LOGGER.debug("[chat] send returned false (kind={}, sender={})", kind, sender);
            }
        } catch (Throwable t) {
            LOGGER.debug("[chat] send threw (kind={}, sender={}): {}", kind, sender, t.getMessage());
        }
    }

    // ── Env helpers ──────────────────────────────────────────────────

    private static String envOrDefault(String key, String fallback) {
        String v = System.getenv(key);
        return (v == null || v.isBlank()) ? fallback : v;
    }

    private static int parseIntEnv(String key, int fallback) {
        String v = System.getenv(key);
        if (v == null || v.isBlank()) return fallback;
        try {
            return Integer.parseInt(v.trim());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private static boolean parseBoolEnv(String key, boolean fallback) {
        String v = System.getenv(key);
        if (v == null) return fallback;
        String lower = v.trim().toLowerCase();
        return lower.equals("true") || lower.equals("1") || lower.equals("yes");
    }

    // ── Tiny JSON helpers (no dependency on a JSON lib) ──────────────

    private static String jsonString(String s) {
        if (s == null) return "null";
        StringBuilder sb = new StringBuilder(s.length() + 2);
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"':  sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        sb.append('"');
        return sb.toString();
    }

    /** Build a tiny single-key JSON object. Good enough for our fixed-shape payloads. */
    private static String jsonObject(String key, String valueJson) {
        return "{" + jsonString(key) + ":" + valueJson + "}";
    }

    private static String entityLabel(LivingEntity entity) {
        if (entity instanceof EnderDragonEntity) return "Ender Dragon";
        if (entity instanceof WitherEntity) return "Wither";
        return entity.getType().getName().getString();
    }
}
