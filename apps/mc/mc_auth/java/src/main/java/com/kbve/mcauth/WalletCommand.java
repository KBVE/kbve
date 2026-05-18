package com.kbve.mcauth;

import com.mojang.brigadier.CommandDispatcher;
import net.minecraft.server.command.ServerCommandSource;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.lang.reflect.Method;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import static net.minecraft.server.command.CommandManager.literal;

public final class WalletCommand {

    private static final Logger LOGGER = LoggerFactory.getLogger(McAuthMod.MOD_ID);
    private static final String CUSTOM_OPENER_CLASS = "com.kbve.statetree.wallet.WalletScreens";
    private static final String CUSTOM_OPENER_METHOD = "openCustom";

    private static final Set<String> PENDING_OPEN = ConcurrentHashMap.newKeySet();

    private WalletCommand() {}

    public static boolean consumePending(String uuid) {
        return uuid != null && PENDING_OPEN.remove(uuid);
    }

    public static void clearPending(String uuid) {
        if (uuid != null) PENDING_OPEN.remove(uuid);
    }

    public static void register(CommandDispatcher<ServerCommandSource> dispatcher) {
        dispatcher.register(literal("wallet").executes(ctx -> {
            ServerPlayerEntity player = ctx.getSource().getPlayer();
            if (player == null) {
                ctx.getSource().sendError(Text.literal("Only players can run /wallet."));
                return 0;
            }
            openFor(player);
            return 1;
        }));
        dispatcher.register(literal("balance").executes(ctx -> {
            ServerPlayerEntity player = ctx.getSource().getPlayer();
            if (player == null) {
                ctx.getSource().sendError(Text.literal("Only players can run /balance."));
                return 0;
            }
            openFor(player);
            return 1;
        }));
    }

    public static void openFor(ServerPlayerEntity player) {
        String uuid = player.getUuidAsString();
        WalletBalanceCache.Entry cached = WalletBalanceCache.get(uuid);
        if (cached == null) {
            requestLazyFetch(player, uuid);
            return;
        }

        long credits = cached.credits;
        long khash = cached.khash;

        if (WalletCapabilityRegistry.isCapable(uuid) && tryCustom(player, credits, khash)) {
            return;
        }
        player.openHandledScreen(WalletChestFactory.build(credits, khash));
    }

    private static void requestLazyFetch(ServerPlayerEntity player, String uuid) {
        LinkStatusRegistry.Entry link = LinkStatusRegistry.get(uuid);
        if (link == null
                || link.state != LinkStatusRegistry.State.LINKED
                || link.supabaseUserId == null) {
            player.sendMessage(
                    Text.literal("[KBVE] Wallet is only available for linked accounts. Run /link first.")
                            .formatted(Formatting.GRAY),
                    false);
            return;
        }
        if (!NativeRuntime.isLoaded()) {
            player.sendMessage(
                    Text.literal("[KBVE] Wallet runtime offline — try again later.")
                            .formatted(Formatting.GRAY),
                    false);
            return;
        }
        PENDING_OPEN.add(uuid);
        try {
            NativeRuntime.fetchBalance(uuid, link.supabaseUserId);
            player.sendMessage(
                    Text.literal("[KBVE] Fetching wallet balance…").formatted(Formatting.GRAY),
                    false);
        } catch (Throwable t) {
            PENDING_OPEN.remove(uuid);
            LOGGER.warn("[{}] fetchBalance threw: {}", McAuthMod.MOD_ID, t.getMessage());
            player.sendMessage(
                    Text.literal("[KBVE] Wallet fetch failed — try again later.")
                            .formatted(Formatting.RED),
                    false);
        }
    }

    private static boolean tryCustom(ServerPlayerEntity player, long credits, long khash) {
        try {
            Class<?> cls = Class.forName(CUSTOM_OPENER_CLASS);
            Method opener = cls.getMethod(CUSTOM_OPENER_METHOD, ServerPlayerEntity.class, long.class, long.class);
            Object result = opener.invoke(null, player, credits, khash);
            return result instanceof Boolean b && b;
        } catch (ClassNotFoundException e) {
            return false;
        } catch (Throwable t) {
            LOGGER.warn("[{}] custom wallet open failed, falling back: {}", McAuthMod.MOD_ID, t.toString());
            return false;
        }
    }
}
