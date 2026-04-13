package com.kbve.statetree.ship;

import net.fabricmc.fabric.api.event.player.PlayerBlockBreakEvents;
import net.minecraft.block.BlockState;
import net.minecraft.block.entity.BlockEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.World;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Prevents players from mining resources from ship blocks.
 *
 * <p>When a block within a tracked ship's region is broken, the break
 * is allowed (so ships can take damage / be dismantled) but the block
 * drops are suppressed — the block simply vanishes. This prevents
 * players from spawning ships as a resource farm.
 *
 * <p>Registered via Fabric's {@code PlayerBlockBreakEvents.AFTER} so
 * the break happens normally but we clear the drops.
 */
public final class ShipProtection {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    private ShipProtection() {}

    /**
     * Register the block break listener. Call once at mod init.
     */
    public static void register(ShipManager manager) {
        // BEFORE: we can cancel the break entirely or modify behavior
        PlayerBlockBreakEvents.BEFORE.register((world, player, pos, state, blockEntity) -> {
            if (world instanceof ServerWorld serverWorld) {
                if (isShipBlock(manager, pos)) {
                    // Allow the break but set the block to air directly
                    // without drops — return false to cancel the normal
                    // break (which would drop items), then set air ourselves
                    serverWorld.setBlockState(pos, net.minecraft.block.Blocks.AIR.getDefaultState(), 18);
                    return false; // cancel normal break (no drops)
                }
            }
            return true; // normal break for non-ship blocks
        });
    }

    /**
     * Check if a block position falls within any tracked ship's region.
     */
    private static boolean isShipBlock(ShipManager manager, BlockPos pos) {
        // Check all active ships
        for (var entry : manager.getActiveShips().entrySet()) {
            ShipManager.ActiveShip ship = entry.getValue();
            BlockPos anchor = ship.anchor;
            ShipData data = ship.data;

            // Quick bounding box check
            int dx = pos.getX() - anchor.getX();
            int dy = pos.getY() - anchor.getY();
            int dz = pos.getZ() - anchor.getZ();

            if (dx >= 0 && dx < data.sizeX()
                    && dy >= 0 && dy < data.sizeY()
                    && dz >= 0 && dz < data.sizeZ()) {
                return true;
            }
        }
        return false;
    }
}
