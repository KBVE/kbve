package com.kbve.statetree;

import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.world.border.WorldBorder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Clamps the survival world to a finite border on first boot.
 *
 * <p>An Immersive Aircraft warship flown to the vanilla ±29,999,984 edge hit
 * the broken far-lands zone, where the vehicle's velocity ran away and the
 * "moved too quickly" flood plus a GrimAC entity NPE starved the server thread
 * until Agones recycled the GameServer. A finite border keeps every vehicle
 * inside loaded, valid space so that edge is never reached.
 *
 * <p>Runs at {@code SERVER_STARTED} and only acts while the border is still at
 * its vanilla default (size &ge; {@code UNSET_THRESHOLD}). Once set, the value
 * persists in level.dat, so a later {@code /worldborder} change by an admin is
 * kept and never overridden on the next boot.
 */
public final class WorldBorderSetup {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    private static final double DIAMETER = 100_000.0;
    private static final double UNSET_THRESHOLD = 1_000_000.0;
    private static final double DAMAGE_PER_BLOCK = 0.2;
    private static final double SAFE_ZONE = 5.0;
    private static final int WARNING_BLOCKS = 64;

    private WorldBorderSetup() {}

    public static void register() {
        ServerLifecycleEvents.SERVER_STARTED.register(server -> {
            ServerWorld overworld = server.getOverworld();
            if (overworld == null) {
                return;
            }
            WorldBorder border = overworld.getWorldBorder();
            if (border.getSize() < UNSET_THRESHOLD) {
                LOGGER.info("[WorldBorder] Border already {} blocks — leaving admin config untouched",
                        border.getSize());
                return;
            }
            border.setCenter(0.0, 0.0);
            border.setSize(DIAMETER);
            border.setDamagePerBlock(DAMAGE_PER_BLOCK);
            border.setSafeZone(SAFE_ZONE);
            border.setWarningBlocks(WARNING_BLOCKS);
            LOGGER.info("[WorldBorder] Survival border set — {}-block diameter centered on 0,0", DIAMETER);
        });
    }
}
