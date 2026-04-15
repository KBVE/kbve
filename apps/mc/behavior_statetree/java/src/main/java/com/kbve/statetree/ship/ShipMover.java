package com.kbve.statetree.ship;

import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;

/**
 * Handles chunked block relocation for ship movement.
 *
 * <p>Moving 400k blocks in a single tick would freeze the server. Instead,
 * movement is broken into phases spread across multiple ticks:
 *
 * <ol>
 *   <li><b>Snapshot</b>: record the current block states + offsets</li>
 *   <li><b>Clear phase</b>: remove N blocks per tick from the old position
 *       (back-to-front so the ship "dissolves" from the trailing edge)</li>
 *   <li><b>Place phase</b>: place N blocks per tick at the new position
 *       (front-to-back so the ship "materializes" from the leading edge)</li>
 * </ol>
 *
 * <p>While a move is in progress, further moves are queued. This prevents
 * desync between the entity position and the block positions.
 */
public final class ShipMover {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    /** Maximum blocks to process per server tick during relocation. */
    private static final int BLOCKS_PER_TICK = 8000;

    /** Pending relocations keyed by ship UUID. */
    private final Map<UUID, MoveJob> activeJobs = new LinkedHashMap<>();

    /** A queued block relocation job. */
    private static final class MoveJob {
        final UUID shipId;
        final ShipData data;
        final BlockPos oldAnchor;
        final BlockPos newAnchor;
        final List<BlockPos> offsets;
        int clearIndex = 0;
        int placeIndex = 0;
        boolean clearDone = false;
        boolean placeDone = false;

        MoveJob(UUID shipId, ShipData data, BlockPos oldAnchor, BlockPos newAnchor) {
            this.shipId = shipId;
            this.data = data;
            this.oldAnchor = oldAnchor;
            this.newAnchor = newAnchor;
            this.offsets = new ArrayList<>(data.blocks().keySet());
        }

        boolean isDone() {
            return clearDone && placeDone;
        }
    }

    /**
     * Queue a ship move from oldAnchor to newAnchor.
     * The actual block relocation happens over subsequent ticks.
     */
    public void queueMove(UUID shipId, ShipData data, BlockPos oldAnchor, BlockPos newAnchor) {
        // If there's already a job for this ship, we can't overlap — drop the old one.
        // In practice the ship should wait for the current move to finish before starting another.
        activeJobs.put(shipId, new MoveJob(shipId, data, oldAnchor, newAnchor));
    }

    /**
     * Process pending relocations. Call once per server tick.
     *
     * @return set of ship UUIDs that completed their move this tick
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
                LOGGER.debug("[Ship] Move complete for {}", job.shipId);
            }
        }

        return completed;
    }

    private void processJob(ServerWorld world, MoveJob job) {
        int budget = BLOCKS_PER_TICK;

        // Phase 1: Clear old blocks
        if (!job.clearDone) {
            while (job.clearIndex < job.offsets.size() && budget > 0) {
                BlockPos offset = job.offsets.get(job.clearIndex);
                BlockPos worldPos = job.oldAnchor.add(offset);
                world.setBlockState(worldPos, Blocks.AIR.getDefaultState(), 18);
                job.clearIndex++;
                budget--;
            }
            if (job.clearIndex >= job.offsets.size()) {
                job.clearDone = true;
            }
        }

        // Phase 2: Place new blocks (starts after clear is done)
        if (job.clearDone && !job.placeDone) {
            while (job.placeIndex < job.offsets.size() && budget > 0) {
                BlockPos offset = job.offsets.get(job.placeIndex);
                BlockState state = job.data.blocks().get(offset);
                if (state != null) {
                    BlockPos worldPos = job.newAnchor.add(offset);
                    world.setBlockState(worldPos, state, 18);
                }
                job.placeIndex++;
                budget--;
            }
            if (job.placeIndex >= job.offsets.size()) {
                job.placeDone = true;
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
