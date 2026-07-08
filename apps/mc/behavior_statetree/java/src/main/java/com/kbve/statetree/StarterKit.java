package com.kbve.statetree;

import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.registry.Registries;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.util.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * One-time starter kit for new players: an Immersive Aircraft warship plus
 * 400 coal blocks of boiler fuel. Delivery is tracked with a persistent
 * command tag on the player, so it survives restarts and never re-fires.
 *
 * <p>Soft-depends on Immersive Aircraft — if the warship item isn't
 * registered (mod absent), the kit is skipped and the tag is NOT set so
 * the player still receives it once the mod is back.
 */
public final class StarterKit {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    /** Bump the suffix when the kit contents change to re-issue to everyone. */
    private static final String KIT_TAG = "kbve_starter_kit_v1";

    private static final Identifier WARSHIP_ID = Identifier.of("immersive_aircraft", "warship");
    private static final int COAL_BLOCKS = 400;

    private StarterKit() {}

    public static void register() {
        ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> {
            ServerPlayerEntity player = handler.getPlayer();
            if (player == null || player.getCommandTags().contains(KIT_TAG)) return;
            give(player);
        });
    }

    private static void give(ServerPlayerEntity player) {
        if (!Registries.ITEM.containsId(WARSHIP_ID)) {
            LOGGER.warn("[StarterKit] {} not registered — kit deferred for {}",
                    WARSHIP_ID, player.getNameForScoreboard());
            return;
        }
        Item warship = Registries.ITEM.get(WARSHIP_ID);

        player.giveItemStack(new ItemStack(warship, 1));
        int remaining = COAL_BLOCKS;
        while (remaining > 0) {
            int n = Math.min(remaining, Items.COAL_BLOCK.getMaxCount());
            player.giveItemStack(new ItemStack(Items.COAL_BLOCK, n));
            remaining -= n;
        }

        player.addCommandTag(KIT_TAG);
        LOGGER.info("[StarterKit] Issued warship + {} coal blocks to {}",
                COAL_BLOCKS, player.getNameForScoreboard());
    }
}
