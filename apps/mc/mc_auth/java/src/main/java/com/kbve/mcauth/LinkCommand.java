package com.kbve.mcauth;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import net.minecraft.server.command.CommandManager;
import net.minecraft.server.command.ServerCommandSource;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Registers the {@code /link <code>} command.
 *
 * <p>Flow: player visits kbve.com, clicks "Link Minecraft account", the
 * webapp calls {@code proxy_request_link} server-side and displays a
 * 6-digit code. Player runs {@code /link 123456} here. The command enqueues
 * a verify job on the native runtime and returns immediately — the actual
 * result flows back via the tick drain as a {@code LinkVerified} or
 * {@code LinkRejected} event that chats the player.
 */
public final class LinkCommand {

    private static final Logger LOGGER = LoggerFactory.getLogger(McAuthMod.MOD_ID);

    private LinkCommand() {}

    public static void register(CommandDispatcher<ServerCommandSource> dispatcher) {
        dispatcher.register(
                CommandManager.literal("link")
                        .requires(source -> source.isExecutedByPlayer())
                        .then(
                                CommandManager.argument("code", IntegerArgumentType.integer(100000, 999999))
                                        .executes(ctx -> {
                                            ServerPlayerEntity player = ctx.getSource().getPlayer();
                                            if (player == null) {
                                                return 0;
                                            }
                                            int code = IntegerArgumentType.getInteger(ctx, "code");
                                            return execute(player, code);
                                        })));
    }

    private static int execute(ServerPlayerEntity player, int code) {
        if (!NativeRuntime.isLoaded()) {
            player.sendMessage(
                    Text.literal("[KBVE] Auth service is not available right now.")
                            .formatted(Formatting.RED),
                    false);
            return 0;
        }

        String uuid = player.getUuidAsString();
        try {
            NativeRuntime.verifyLink(uuid, code);
        } catch (Throwable t) {
            LOGGER.warn("[{}] verifyLink() threw: {}", McAuthMod.MOD_ID, t.getMessage());
            player.sendMessage(
                    Text.literal("[KBVE] Couldn't submit link code. Try again in a moment.")
                            .formatted(Formatting.RED),
                    false);
            return 0;
        }

        player.sendMessage(
                Text.literal("[KBVE] Checking your code...").formatted(Formatting.GRAY),
                false);
        return 1;
    }
}
