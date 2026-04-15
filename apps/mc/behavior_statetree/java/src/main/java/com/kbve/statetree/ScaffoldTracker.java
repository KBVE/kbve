package com.kbve.statetree;

import net.minecraft.block.Blocks;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;

import java.util.Iterator;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * Tracks scaffolding blocks placed by AI melee skeletons and removes
 * them after their cleanup timer expires.
 *
 * <p>This prevents the world from filling up with scaffolding over time.
 * Each placed block is tracked with the server tick at which it was placed
 * and the number of ticks before it should be auto-removed.
 */
public final class ScaffoldTracker {

    private record PlacedBlock(BlockPos pos, long placedAtTick, long cleanupAfterTicks) {}

    private final ConcurrentLinkedQueue<PlacedBlock> pending = new ConcurrentLinkedQueue<>();

    /**
     * Register a placed scaffold block for future cleanup.
     *
     * @param pos            block position
     * @param currentTick    server tick when placed
     * @param cleanupTicks   ticks until auto-removal (0 = no cleanup)
     */
    public void track(BlockPos pos, long currentTick, long cleanupTicks) {
        if (cleanupTicks <= 0) return;
        pending.add(new PlacedBlock(pos, currentTick, cleanupTicks));
    }

    /**
     * Check for expired scaffolds and remove them. Call once per tick
     * from the tick handler.
     */
    public void tick(ServerWorld world, long currentTick) {
        Iterator<PlacedBlock> it = pending.iterator();
        while (it.hasNext()) {
            PlacedBlock block = it.next();
            if (currentTick - block.placedAtTick >= block.cleanupAfterTicks) {
                // Only remove if it's still scaffolding (player might have
                // broken it already or replaced it with something else)
                if (world.getBlockState(block.pos).isOf(Blocks.SCAFFOLDING)) {
                    world.setBlockState(block.pos, Blocks.AIR.getDefaultState());
                }
                it.remove();
            }
        }
    }

    /** Number of blocks currently tracked for cleanup. */
    public int size() {
        return pending.size();
    }
}
