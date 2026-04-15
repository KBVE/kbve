package com.kbve.statetree.ship;

import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;

/**
 * Diff-based block relocation for ship movement.
 *
 * <p>For small movements (1-3 blocks), the new ship position overlaps the
 * old position by ~99%. Naively clearing all old blocks and placing all
 * new blocks does 2N operations when only the trailing edge needs to be
 * cleared and the leading edge needs to be placed.
 *
 * <p>This implementation:
 * <ol>
 *   <li>Computes the SET of new world positions (ship blocks at new anchor)</li>
 *   <li>Computes the SET of old world positions (ship blocks at old anchor)</li>
 *   <li>Clear list = old positions NOT in the new set (trailing edge)</li>
 *   <li>Place list = new positions (whole ship — needed because some blocks
 *       might have wrong state from neighbor updates)</li>
 * </ol>
 *
 * <p>For a 1-block move on a 20k-block ship, this is ~99% reduction in
 * clear ops. Place ops still cover the full ship to ensure correct state.
 */
public final class ShipMover {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    /** Maximum blocks to process per server tick during relocation. */
    private static final int BLOCKS_PER_TICK = 25000;

    /** Pending relocations keyed by ship UUID. */
    private final Map<UUID, MoveJob> activeJobs = new LinkedHashMap<>();

    /** A queued block relocation job with diff optimization. */
    private static final class MoveJob {
        final UUID shipId;
        final ShipData data;
        final BlockPos oldAnchor;
        final BlockPos newAnchor;

        /** Positions to clear — old occupied positions that aren't in the new ship footprint. */
        final List<BlockPos> clearList;
        /** Offsets to place — full ship (we re-place everything to ensure correct state). */
        final List<BlockPos> placeOffsets;

        int clearIndex = 0;
        int placeIndex = 0;
        boolean clearDone = false;
        boolean placeDone = false;

        MoveJob(UUID shipId, ShipData data, BlockPos oldAnchor, BlockPos newAnchor) {
            this.shipId = shipId;
            this.data = data;
            this.oldAnchor = oldAnchor;
            this.newAnchor = newAnchor;
            this.placeOffsets = new ArrayList<>(data.blocks().keySet());

            // Compute diff: new occupied set
            Set<BlockPos> newOccupied = new HashSet<>(data.blocks().size());
            for (BlockPos offset : data.blocks().keySet()) {
                newOccupied.add(newAnchor.add(offset));
            }

            // Old positions that are NOT in new — these need clearing
            this.clearList = new ArrayList<>();
            for (BlockPos offset : data.blocks().keySet()) {
                BlockPos oldPos = oldAnchor.add(offset);
                if (!newOccupied.contains(oldPos)) {
                    clearList.add(oldPos);
                }
            }
        }

        boolean isDone() {
            return clearDone && placeDone;
        }
    }

    /**
     * Queue a ship move from oldAnchor to newAnchor.
     */
    public void queueMove(UUID shipId, ShipData data, BlockPos oldAnchor, BlockPos newAnchor) {
        activeJobs.put(shipId, new MoveJob(shipId, data, oldAnchor, newAnchor));
    }

    /**
     * Process pending relocations. Call once per server tick.
     */
    public Set<UUID> tick(ServerWorld world) {
        Set<UUID> completed = new HashSet<>();
        Iterator<Map.Entry<UUID, MoveJob>> it = activeJobs.entrySet().iterator();

        while (it.hasNext()) {
            MoveJob job = it.next().getValue();
            processJob(world, job);

            if (job.isDone()) {
                completed.add(job.shipId);
                it.remove();
            }
        }

        return completed;
    }

    private void processJob(ServerWorld world, MoveJob job) {
        int budget = BLOCKS_PER_TICK;

        // Phase 1: Place new blocks FIRST (so the ship is never invisible).
        // For overlapping positions, this overwrites old state with new state.
        if (!job.placeDone) {
            while (job.placeIndex < job.placeOffsets.size() && budget > 0) {
                BlockPos offset = job.placeOffsets.get(job.placeIndex);
                BlockState state = job.data.blocks().get(offset);
                if (state != null) {
                    BlockPos worldPos = job.newAnchor.add(offset);
                    // Flag 2 = notify clients only (no block updates / observers / redraws).
                    world.setBlockState(worldPos, state, 2);
                }
                job.placeIndex++;
                budget--;
            }
            if (job.placeIndex >= job.placeOffsets.size()) {
                job.placeDone = true;
            }
        }

        // Phase 2: Clear trailing edge (only positions not in new footprint).
        // For a 1-block move on a 20k-block ship, this is ~200 blocks instead of 20k.
        if (job.placeDone && !job.clearDone) {
            while (job.clearIndex < job.clearList.size() && budget > 0) {
                BlockPos worldPos = job.clearList.get(job.clearIndex);
                world.setBlockState(worldPos, Blocks.AIR.getDefaultState(), 2);
                job.clearIndex++;
                budget--;
            }
            if (job.clearIndex >= job.clearList.size()) {
                job.clearDone = true;
            }
        }
    }

    /** Check if a ship currently has a move in progress. */
    public boolean isMoving(UUID shipId) {
        return activeJobs.containsKey(shipId);
    }

    /** Number of active move jobs. */
    public int activeJobCount() {
        return activeJobs.size();
    }
}
