package com.kbve.statetree;

import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Random;

/**
 * Tops up the Capital Guard population to {@link #TARGET_COUNT} at server
 * start. Counts surviving guards by scoreboard tag so previously spawned
 * guards loaded from disk are honored; only the deficit is spawned fresh.
 *
 * <p>Anchors are scattered around world spawn ({@code 0, 0}) so guards
 * don't pile up on one block. Vanilla IronGolem AI then takes over —
 * they patrol within wander radius and aggro any hostile that comes
 * inside their target-detection range.
 */
public final class CapitalGuardSpawner {

    private static final Logger LOGGER = LoggerFactory.getLogger(BehaviorStateTreeMod.MOD_ID);

    static final int TARGET_COUNT = 4;
    private static final int ANCHOR_RADIUS = 24;

    private CapitalGuardSpawner() {}

    public static void register(AiCreatureManager manager) {
        ServerLifecycleEvents.SERVER_STARTED.register(server -> populate(server, manager));
    }

    private static void populate(MinecraftServer server, AiCreatureManager manager) {
        ServerWorld overworld = server.getOverworld();
        if (overworld == null) return;

        int reclaimed = manager.reclaimPersistedKind(
                overworld, CreatureKinds.CAPITAL_GUARD, CapitalGuardKind.GUARD_TAG);
        int existing = manager.aliveCount(overworld, CreatureKinds.CAPITAL_GUARD);
        int deficit = Math.max(0, TARGET_COUNT - existing);
        LOGGER.info("[capital-guard] reclaimed={} existing={} target={} spawning={}",
                reclaimed, existing, TARGET_COUNT, deficit);
        if (deficit == 0) return;

        Random rand = new Random();
        BlockPos spawn = overworld.getSpawnPos();
        int spawned = 0;
        for (int i = 0; i < deficit; i++) {
            int ox = rand.nextInt(ANCHOR_RADIUS * 2 + 1) - ANCHOR_RADIUS;
            int oz = rand.nextInt(ANCHOR_RADIUS * 2 + 1) - ANCHOR_RADIUS;
            BlockPos anchor = spawn.add(ox, 0, oz);
            if (!SpawnRegion.containsBlock(anchor)) continue;
            if (manager.spawnAtAnchor(overworld, CreatureKinds.CAPITAL_GUARD, anchor)) {
                spawned++;
            }
        }
        LOGGER.info("[capital-guard] spawned {} new guard(s)", spawned);
    }

}
