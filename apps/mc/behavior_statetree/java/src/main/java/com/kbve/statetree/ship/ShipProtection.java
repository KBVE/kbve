package com.kbve.statetree.ship;

import net.fabricmc.fabric.api.event.player.PlayerBlockBreakEvents;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Prevents players from mining resources from ship blocks.
 *
 * <p>When a block within a tracked ship is broken:
 * <ul>
 *   <li>The block is set to air (no drops, no items)</li>
 *   <li>The block is removed from the ship's live block tracker</li>
 *   <li>Hull integrity is logged when it drops below thresholds</li>
 * </ul>
 */
public final class ShipProtection {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    private ShipProtection() {}

    public static void register(ShipManager manager) {
        PlayerBlockBreakEvents.BEFORE.register((world, player, pos, state, blockEntity) -> {
            if (world instanceof ServerWorld serverWorld) {
                ShipManager.ActiveShip ship = findShipAt(manager, pos);
                if (ship != null) {
                    // Calculate the offset within the ship
                    BlockPos offset = new BlockPos(
                            pos.getX() - ship.anchor.getX(),
                            pos.getY() - ship.anchor.getY(),
                            pos.getZ() - ship.anchor.getZ()
                    );

                    // Set to air without drops
                    serverWorld.setBlockState(pos, net.minecraft.block.Blocks.AIR.getDefaultState(), 18);

                    // Update the live block tracker
                    ship.blockTracker.removeBlock(offset);

                    // Broadcast damage to all clients (HUD + effects)
                    ShipNetworking.broadcastShipStatus(
                            serverWorld, ship,
                            pos.getX(), pos.getY(), pos.getZ(),
                            (byte) 0 // 0 = removed
                    );

                    return false; // cancel normal break (no drops)
                }
            }
            return true;
        });
    }

    /**
     * Find which ship (if any) owns the block at the given position.
     * Returns null if the position is not within any tracked ship.
     */
    private static ShipManager.ActiveShip findShipAt(ShipManager manager, BlockPos pos) {
        for (var entry : manager.getActiveShips().entrySet()) {
            ShipManager.ActiveShip ship = entry.getValue();
            BlockPos anchor = ship.anchor;
            ShipData data = ship.data;

            int dx = pos.getX() - anchor.getX();
            int dy = pos.getY() - anchor.getY();
            int dz = pos.getZ() - anchor.getZ();

            if (dx >= 0 && dx < data.sizeX()
                    && dy >= 0 && dy < data.sizeY()
                    && dz >= 0 && dz < data.sizeZ()) {
                // Also verify this offset is actually tracked (not already broken)
                BlockPos offset = new BlockPos(dx, dy, dz);
                if (ship.blockTracker.blocks().contains(offset)) {
                    return ship;
                }
            }
        }
        return null;
    }
}
