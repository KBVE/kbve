package com.kbve.mcauth;

import com.mojang.brigadier.CommandDispatcher;
import net.minecraft.server.command.CommandManager;
import net.minecraft.server.command.ServerCommandSource;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Registers the {@code /chat-token} command.
 *
 * <p>Players run this in-game to receive a short-lived HS256 JWT they can
 * present to the irc-gateway {@code /minechat} WebSocket endpoint. The
 * token is minted locally by {@link NativeRuntime#mintChatToken} — no
 * network I/O — and includes claims for the player's UUID and username
 * so the gateway can set the IRC nick without re-running Mojang auth.
 *
 * <p>Output is sent only to the requesting player (never broadcast) and
 * only via {@code sendMessage(..., false)} — not the overlay — so the
 * token doesn't end up flashed on other nearby clients' screens.
 *
 * <p>The token is a raw string, not hyperlinked. Future work: wire a
 * custom plugin-message channel so a companion client mod can pick it
 * up automatically without the player copy-pasting.
 */
public final class ChatTokenCommand {

    private static final Logger LOGGER = LoggerFactory.getLogger(McAuthMod.MOD_ID);

    private ChatTokenCommand() {}

    public static void register(CommandDispatcher<ServerCommandSource> dispatcher) {
        dispatcher.register(
                CommandManager.literal("chat-token")
                        .requires(source -> source.isExecutedByPlayer())
                        .executes(ctx -> {
                            ServerPlayerEntity player = ctx.getSource().getPlayer();
                            if (player == null) {
                                return 0;
                            }
                            return execute(player);
                        }));
    }

    private static int execute(ServerPlayerEntity player) {
        if (!NativeRuntime.isLoaded()) {
            player.sendMessage(
                    Text.literal("[KBVE] Chat service is not available right now.")
                            .formatted(Formatting.RED),
                    false);
            return 0;
        }

        String uuid = player.getUuidAsString();
        String username = player.getNameForScoreboard();

        String json;
        try {
            json = NativeRuntime.mintChatToken(uuid, username);
        } catch (Throwable t) {
            LOGGER.warn("[{}] mintChatToken() threw: {}", McAuthMod.MOD_ID, t.getMessage());
            player.sendMessage(
                    Text.literal("[KBVE] Couldn't mint chat token. Try again in a moment.")
                            .formatted(Formatting.RED),
                    false);
            return 0;
        }

        // Parse the JSON response by hand. We avoid pulling in a full JSON
        // library for what is essentially {"token":"..."} or {"error":"..."}.
        // If the shape ever grows beyond this, switch to a real parser.
        String token = extractField(json, "token");
        if (token != null) {
            player.sendMessage(
                    Text.literal("[KBVE] Chat token (valid ~5 minutes, copy quickly):")
                            .formatted(Formatting.GRAY),
                    false);
            player.sendMessage(
                    Text.literal(token).formatted(Formatting.WHITE),
                    false);
            return 1;
        }

        String error = extractField(json, "error");
        String msg = error != null ? error : "unknown error";
        LOGGER.info("[{}] chat token mint failed for {}: {}", McAuthMod.MOD_ID, username, msg);
        player.sendMessage(
                Text.literal("[KBVE] Chat token unavailable: " + msg)
                        .formatted(Formatting.RED),
                false);
        return 0;
    }

    /**
     * Pull a string value out of a trivially-shaped JSON object. Handles
     * the two shapes this command produces: {@code {"token":"..."}} and
     * {@code {"error":"..."}}. Does NOT handle escape sequences beyond
     * what the Rust side emits (no backslash in tokens, so this is fine).
     */
    private static String extractField(String json, String key) {
        if (json == null) return null;
        String needle = "\"" + key + "\":\"";
        int start = json.indexOf(needle);
        if (start < 0) return null;
        start += needle.length();
        int end = json.indexOf('"', start);
        if (end < 0) return null;
        return json.substring(start, end);
    }
}
