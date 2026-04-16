package com.kbve.statetree.ship;

import net.minecraft.block.Blocks;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.nbt.NbtIo;
import net.minecraft.nbt.NbtSizeTracker;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.structure.StructurePlacementData;
import net.minecraft.structure.StructureTemplate;
import net.minecraft.util.math.BlockPos;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.InputStream;
import java.util.*;

/**
 * StructureTemplate-based ship movement.
 *
 * <p>Uses MC's native {@link StructureTemplate#place} for block placement —
 * a single optimized call that handles chunk batching, palette compression,
 * and minimal network packets internally. Dramatically faster than 20k
 * individual {@code setBlockState} calls.
 *
 * <p>Movement phases:
 * <ol>
 *   <li><b>Place</b>: template.place() at the new anchor (one call)</li>
 *   <li><b>Clear trailing edge</b>: only positions from the old footprint
 *       that don't overlap the new footprint (~200 blocks for a 1-block move)</li>
 * </ol>
 */
public final class ShipMover {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    /** Maximum trailing-edge blocks to clear per tick. */
    private static final int CLEAR_PER_TICK = 5000;

    /** Cached StructureTemplates keyed by schematic name. */
    private final Map<String, StructureTemplate> templateCache = new HashMap<>();

    /** Pending relocations. */
    private final Map<UUID, MoveJob> activeJobs = new LinkedHashMap<>();

    /** A move job with pre-computed trailing-edge clear list. */
    private static final class MoveJob {
        final UUID shipId;
        final ShipData data;
        final BlockPos oldAnchor;
        final BlockPos newAnchor;
        final List<BlockPos> trailingEdge;
        boolean placed = false;
        int clearIndex = 0;

        MoveJob(UUID shipId, ShipData data, BlockPos oldAnchor, BlockPos newAnchor) {
            this.shipId = shipId;
            this.data = data;
            this.oldAnchor = oldAnchor;
            this.newAnchor = newAnchor;

            // Compute trailing edge: old positions NOT in new footprint
            Set<BlockPos> newOccupied = new HashSet<>(data.blocks().size());
            for (BlockPos offset : data.blocks().keySet()) {
                newOccupied.add(newAnchor.add(offset));
            }
            this.trailingEdge = new ArrayList<>();
            for (BlockPos offset : data.blocks().keySet()) {
                BlockPos oldPos = oldAnchor.add(offset);
                if (!newOccupied.contains(oldPos)) {
                    trailingEdge.add(oldPos);
                }
            }
        }

        boolean isDone() {
            return placed && clearIndex >= trailingEdge.size();
        }
    }

    /**
     * Load a StructureTemplate from the schematic's JAR resource.
     * Cached after first load.
     */
    public StructureTemplate getOrLoadTemplate(ServerWorld world, ShipData data, String resourcePath) {
        return templateCache.computeIfAbsent(data.name(), name -> {
            try {
                InputStream stream = getClass().getResourceAsStream(resourcePath);
                if (stream == null) {
                    LOGGER.error("[Ship] Template resource not found: {}", resourcePath);
                    return null;
                }
                NbtCompound nbt = NbtIo.readCompressed(stream, NbtSizeTracker.ofUnlimitedBytes());
                StructureTemplate template = new StructureTemplate();
                template.readNbt(net.minecraft.registry.Registries.BLOCK, nbt);
                LOGGER.info("[Ship] Loaded StructureTemplate '{}' ({})",
                        name, template.getSize());
                return template;
            } catch (Exception e) {
                LOGGER.error("[Ship] Failed to load template '{}': {}", name, e.getMessage());
                return null;
            }
        });
    }

    /**
     * Queue a ship move.
     */
    public void queueMove(UUID shipId, ShipData data, BlockPos oldAnchor, BlockPos newAnchor) {
        activeJobs.put(shipId, new MoveJob(shipId, data, oldAnchor, newAnchor));
    }

    /**
     * Process pending moves. Call once per server tick.
     */
    public Set<UUID> tick(ServerWorld world) {
        Set<UUID> completed = new HashSet<>();
        Iterator<Map.Entry<UUID, MoveJob>> it = activeJobs.entrySet().iterator();

        while (it.hasNext()) {
            MoveJob job = it.next().getValue();

            // Phase 1: Place the template at the new anchor (single call)
            if (!job.placed) {
                StructureTemplate template = templateCache.get(job.data.name());
                if (template != null) {
                    StructurePlacementData settings = new StructurePlacementData();
                    template.place(world, job.newAnchor, BlockPos.ORIGIN, settings,
                            world.getRandom(), 2); // flag 2 = notify clients only
                    job.placed = true;
                } else {
                    // No template cached — fall back to block-by-block placement
                    int budget = 25000;
                    var entries = new ArrayList<>(job.data.blocks().entrySet());
                    for (var entry : entries) {
                        if (budget <= 0) break;
                        world.setBlockState(job.newAnchor.add(entry.getKey()), entry.getValue(), 2);
                        budget--;
                    }
                    job.placed = true;
                }
            }

            // Phase 2: Clear trailing edge (only the diff)
            if (job.placed) {
                int budget = CLEAR_PER_TICK;
                while (job.clearIndex < job.trailingEdge.size() && budget > 0) {
                    world.setBlockState(job.trailingEdge.get(job.clearIndex),
                            Blocks.AIR.getDefaultState(), 2);
                    job.clearIndex++;
                    budget--;
                }
            }

            if (job.isDone()) {
                completed.add(job.shipId);
                it.remove();
            }
        }

        return completed;
    }

    public boolean isMoving(UUID shipId) {
        return activeJobs.containsKey(shipId);
    }

    public int activeJobCount() {
        return activeJobs.size();
    }
}
