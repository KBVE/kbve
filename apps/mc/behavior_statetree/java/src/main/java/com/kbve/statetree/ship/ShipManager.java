package com.kbve.statetree.ship;

import net.minecraft.block.BedBlock;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.state.property.Properties;
import net.minecraft.util.math.Direction;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.Heightmap;
import net.minecraft.world.biome.Biome;
import net.minecraft.world.biome.BiomeKeys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Manages active ships in the world — placement, tracking, and removal.
 *
 * <p>Each ship is identified by a UUID and associated with an owner
 * (player UUID). The manager handles:
 * <ul>
 *   <li>Finding safe ocean locations with enough depth and clearance</li>
 *   <li>Placing a {@link ShipData} schematic as real blocks in the world</li>
 *   <li>Tracking which blocks belong to which ship</li>
 *   <li>Removing all ship blocks on despawn</li>
 * </ul>
 */
public final class ShipManager {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    /** Minimum ocean depth (blocks of water) required at every XZ cell of the ship footprint. */
    private static final int MIN_OCEAN_DEPTH = 10;

    /** Search radius (in blocks) around the starting position when looking for safe ocean. */
    private static final int OCEAN_SEARCH_RADIUS = 512;

    /** Step size for the spiral ocean search. */
    private static final int SEARCH_STEP = 32;

    /** Ocean biomes that are safe for ship placement. */
    private static final Set<RegistryKey<Biome>> OCEAN_BIOMES = Set.of(
            BiomeKeys.OCEAN,
            BiomeKeys.DEEP_OCEAN,
            BiomeKeys.WARM_OCEAN,
            BiomeKeys.LUKEWARM_OCEAN,
            BiomeKeys.COLD_OCEAN,
            BiomeKeys.DEEP_LUKEWARM_OCEAN,
            BiomeKeys.DEEP_COLD_OCEAN,
            BiomeKeys.DEEP_FROZEN_OCEAN,
            BiomeKeys.FROZEN_OCEAN
    );

    /** Blocks to place per server tick during ship placement.
     *  500 blocks/tick keeps the server smooth — a 400k block ship takes
     *  ~800 ticks (~40 seconds) to fully materialize. The Shipyard pre-builds
     *  ships in the background so players rarely wait. */
    private static final int PLACEMENT_BLOCKS_PER_TICK = 500;

    /** Active ships keyed by ship UUID. */
    private final ConcurrentHashMap<UUID, ActiveShip> ships = new ConcurrentHashMap<>();

    /** Chunked block relocation engine. */
    private final ShipMover mover = new ShipMover();

    /** Pending initial placements (chunked across ticks). */
    private final ConcurrentHashMap<UUID, PlacementJob> placementJobs = new ConcurrentHashMap<>();

    /** A chunked initial placement job with water-clearing pre-pass. */
    private static final class PlacementJob {
        final UUID shipId;
        final UUID ownerUuid;
        final ShipData data;
        final BlockPos anchor;
        final java.util.List<Map.Entry<BlockPos, BlockState>> entries;

        /** Phase 0: clear water/fluid in the ship's bounding box. */
        final java.util.List<BlockPos> clearPositions;
        int clearIndex = 0;
        boolean clearDone = false;

        /** Phase 1: place ship blocks. */
        int placeIndex = 0;

        PlacementJob(UUID shipId, UUID ownerUuid, ShipData data, BlockPos anchor) {
            this.shipId = shipId;
            this.ownerUuid = ownerUuid;
            this.data = data;
            this.anchor = anchor;
            this.entries = new java.util.ArrayList<>(data.blocks().entrySet());

            // Clear water at ship block positions PLUS a 1-block buffer around
            // the hull at and below sea level. This prevents water from seeping
            // through gaps in the hull and handles the waterline cleanly.
            java.util.Set<BlockPos> clearSet = new java.util.HashSet<>(data.blocks().keySet());

            // Add a buffer zone: for each ship block at or below Y=5 (relative
            // to anchor, which is at sea level), also clear adjacent positions.
            // This creates a dry cavity inside the hull.
            for (BlockPos bp : data.blocks().keySet()) {
                if (bp.getY() <= 5) { // waterline zone (5 blocks above anchor)
                    for (int dx = -1; dx <= 1; dx++) {
                        for (int dz = -1; dz <= 1; dz++) {
                            BlockPos adj = bp.add(dx, 0, dz);
                            if (adj.getX() >= 0 && adj.getX() < data.sizeX()
                                    && adj.getZ() >= 0 && adj.getZ() < data.sizeZ()) {
                                clearSet.add(adj);
                            }
                            // Also clear below
                            for (int dy = -1; dy >= -3; dy--) {
                                BlockPos below = bp.add(dx, dy, dz);
                                if (below.getY() >= 0) {
                                    clearSet.add(below);
                                }
                            }
                        }
                    }
                }
            }
            clearPositions = new java.util.ArrayList<>(clearSet);
        }

        boolean isDone() { return clearDone && placeIndex >= entries.size(); }
    }

    /** Live tracking of which blocks currently belong to a ship.
     *  Starts as a copy of the schematic, mutated as blocks are
     *  broken (damage) or added (upgrades). Used by despawn to know
     *  exactly which blocks to clear, and for hull integrity %. */
    public static final class ShipBlockTracker {
        private final java.util.Set<BlockPos> liveBlocks;
        private final int originalCount;

        ShipBlockTracker(ShipData data) {
            this.liveBlocks = ConcurrentHashMap.newKeySet();
            this.liveBlocks.addAll(data.blocks().keySet());
            this.originalCount = data.blockCount();
        }

        /** Mark a block as destroyed (broken by player/explosion). */
        public void removeBlock(BlockPos offset) {
            liveBlocks.remove(offset);
        }

        /** Add a block (upgrade/repair). */
        public void addBlock(BlockPos offset) {
            liveBlocks.add(offset);
        }

        /** Current live block count. */
        public int blockCount() { return liveBlocks.size(); }

        /** Hull integrity as a percentage (100% = undamaged). */
        public float integrity() {
            return originalCount > 0 ? (float) liveBlocks.size() / originalCount * 100f : 0f;
        }

        /** All live block offsets (for despawn cleanup). */
        public java.util.Set<BlockPos> blocks() { return liveBlocks; }
    }

    /** Record of an active ship in the world. */
    public static final class ActiveShip {
        public final UUID shipId;
        public final UUID ownerUuid;
        public final String shipName;
        public BlockPos anchor;
        public final ShipData data;
        public final ShipBlockTracker blockTracker;
        public float heading = 0.0f;

        ActiveShip(UUID shipId, UUID ownerUuid, String shipName, BlockPos anchor, ShipData data) {
            this.shipId = shipId;
            this.blockTracker = new ShipBlockTracker(data);
            this.ownerUuid = ownerUuid;
            this.shipName = shipName;
            this.anchor = anchor;
            this.data = data;
        }
    }

    /**
     * Find a safe ocean location and place the ship.
     *
     * @param world     the overworld
     * @param data      ship schematic
     * @param ownerUuid player who owns this ship
     * @param searchFrom starting position for ocean search (e.g., player pos)
     * @return the ship UUID if placed successfully, null if no safe location found
     */
    public UUID placeShip(ServerWorld world, ShipData data, UUID ownerUuid, BlockPos searchFrom) {
        BlockPos ocean = findSafeOcean(world, searchFrom, data.sizeX(), data.sizeZ());
        if (ocean == null) {
            LOGGER.warn("[Ship] No safe ocean found near {} for {} ({}x{})",
                    searchFrom.toShortString(), data.name(), data.sizeX(), data.sizeZ());
            return null;
        }

        // Place anchor at sea level (Y=63 is typical ocean surface)
        int seaLevel = world.getSeaLevel();
        BlockPos anchor = new BlockPos(ocean.getX(), seaLevel, ocean.getZ());

        UUID shipId = UUID.randomUUID();
        LOGGER.info("[Ship] Queuing '{}' at {} ({} blocks, owner={})",
                data.name(), anchor.toShortString(), data.blockCount(), ownerUuid);

        // Queue chunked placement via the mover — same engine used for
        // movement. This spreads 400k blocks across multiple ticks instead
        // of freezing the server thread.
        ActiveShip ship = new ActiveShip(shipId, ownerUuid, data.name(), anchor, data);
        ships.put(shipId, ship);

        // Use a "move from nowhere" — old anchor is the same as new anchor,
        // but we skip the clear phase and go straight to placement.
        placementJobs.put(shipId, new PlacementJob(shipId, ownerUuid, data, anchor));

        LOGGER.info("[Ship] Placement queued for '{}' (id={}), ~{} ticks to complete",
                data.name(), shipId, data.blockCount() / PLACEMENT_BLOCKS_PER_TICK + 1);

        return shipId;
    }

    /**
     * Remove all blocks belonging to a ship, despawn its entity, and untrack it.
     */
    public boolean removeShip(ServerWorld world, UUID shipId) {
        ActiveShip ship = ships.remove(shipId);
        if (ship == null) return false;

        // Use live block tracker — only clears blocks that still exist
        // (broken blocks were already removed from the tracker)
        int removed = 0;
        for (BlockPos offset : ship.blockTracker.blocks()) {
            BlockPos worldPos = ship.anchor.add(offset);
            world.setBlockState(worldPos, Blocks.AIR.getDefaultState());
            removed++;
        }

        LOGGER.info("[Ship] Removed {} blocks for '{}' (id={})", removed, ship.shipName, shipId);
        return true;
    }

    /**
     * Move a ship forward along its heading by the given distance.
     * The actual block relocation is chunked across multiple ticks.
     */
    public void moveShip(UUID shipId, int distance) {
        ActiveShip ship = ships.get(shipId);
        if (ship == null) return;
        if (mover.isMoving(shipId)) return; // Wait for current move to finish

        double rad = Math.toRadians(ship.heading);
        int dx = (int) Math.round(-Math.sin(rad) * distance);
        int dz = (int) Math.round(Math.cos(rad) * distance);

        BlockPos newAnchor = ship.anchor.add(dx, 0, dz);
        mover.queueMove(shipId, ship.data, ship.anchor, newAnchor);
        ship.anchor = newAnchor;
    }

    /**
     * Tick the ship manager — processes chunked placements and relocations.
     * Call once per server tick.
     */
    public void tick(ServerWorld world) {
        // Process chunked initial placements (two-phase: clear water, then place)
        var it = placementJobs.entrySet().iterator();
        while (it.hasNext()) {
            PlacementJob job = it.next().getValue();
            int budget = PLACEMENT_BLOCKS_PER_TICK;

            // Phase 0: clear water/fluid at ship block positions
            if (!job.clearDone) {
                while (job.clearIndex < job.clearPositions.size() && budget > 0) {
                    BlockPos offset = job.clearPositions.get(job.clearIndex);
                    BlockPos worldPos = job.anchor.add(offset);
                    net.minecraft.block.BlockState existing = world.getBlockState(worldPos);
                    // Only clear fluids (water, lava) and waterlogged blocks
                    if (!existing.getFluidState().isEmpty()) {
                        world.setBlockState(worldPos, net.minecraft.block.Blocks.AIR.getDefaultState(), 18);
                    }
                    job.clearIndex++;
                    budget--;
                }
                if (job.clearIndex >= job.clearPositions.size()) {
                    job.clearDone = true;
                    LOGGER.info("[Ship] Water cleared for '{}', placing blocks...", job.data.name());
                }
            }

            // Phase 1: place ship blocks
            if (job.clearDone) {
                while (job.placeIndex < job.entries.size() && budget > 0) {
                    var entry = job.entries.get(job.placeIndex);
                    BlockPos worldPos = job.anchor.add(entry.getKey());
                    world.setBlockState(worldPos, entry.getValue(), 18);
                    job.placeIndex++;
                    budget--;
                }
            }

            if (job.isDone()) {
                it.remove();
                LOGGER.info("[Ship] Placement complete for '{}' ({} blocks placed)",
                        job.data.name(), job.entries.size());

                // Place a bed on the deck and set the owner's spawn + teleport them there
                placeBedOnDeck(world, job.anchor, job.data, job.ownerUuid);
            }
        }

        // Process chunked movement relocations
        mover.tick(world);
    }

    // -----------------------------------------------------------------------
    // Bed placement — spawn point on the deck
    // -----------------------------------------------------------------------

    /**
     * Place a red bed on the highest solid surface near the center of the
     * ship. Scans downward from the top of the schematic to find the deck.
     */
    private void placeBedOnDeck(ServerWorld world, BlockPos anchor, ShipData data, UUID ownerUuid) {
        int cx = data.sizeX() / 2;
        int cz = data.sizeZ() / 2;

        // Scan down from the top to find the first solid block near center
        int deckY = -1;
        for (int y = data.sizeY() - 1; y >= 0; y--) {
            BlockPos check = new BlockPos(cx, y, cz);
            if (data.blocks().containsKey(check)) {
                deckY = y + 1; // one above the solid block
                break;
            }
        }

        if (deckY < 0) {
            for (int dx = -2; dx <= 2 && deckY < 0; dx++) {
                for (int dz = -2; dz <= 2 && deckY < 0; dz++) {
                    for (int y = data.sizeY() - 1; y >= 0; y--) {
                        BlockPos check = new BlockPos(cx + dx, y, cz + dz);
                        if (data.blocks().containsKey(check)) {
                            deckY = y + 1;
                            cx = cx + dx;
                            cz = cz + dz;
                            break;
                        }
                    }
                }
            }
        }

        if (deckY < 0) {
            LOGGER.warn("[Ship] Could not find deck surface for bed placement");
            return;
        }

        // Place a bed (foot + head, facing north)
        BlockPos footPos = anchor.add(cx, deckY, cz);
        BlockPos headPos = footPos.north();

        BlockState foot = Blocks.RED_BED.getDefaultState()
                .with(BedBlock.FACING, Direction.NORTH)
                .with(BedBlock.PART, net.minecraft.block.enums.BedPart.FOOT);
        BlockState head = Blocks.RED_BED.getDefaultState()
                .with(BedBlock.FACING, Direction.NORTH)
                .with(BedBlock.PART, net.minecraft.block.enums.BedPart.HEAD);

        world.setBlockState(footPos, foot, 18);
        world.setBlockState(headPos, head, 18);

        LOGGER.info("[Ship] Bed placed on deck at {}", footPos.toShortString());

        // Find the owner player and set their spawn + teleport them to the deck
        net.minecraft.server.network.ServerPlayerEntity owner = null;
        for (net.minecraft.server.network.ServerPlayerEntity player : world.getPlayers()) {
            if (player.getUuid().equals(ownerUuid)) {
                owner = player;
                break;
            }
        }

        if (owner != null) {
            // Set spawn point + teleport via server commands — avoids
            // chasing 1.21.11 Yarn API changes for setSpawnPoint/Respawn
            var server = world.getServer();
            String playerName = owner.getNameForScoreboard();
            int bx = footPos.getX(), by = footPos.getY(), bz = footPos.getZ();

            server.getCommandManager().executeWithPrefix(
                    server.getCommandSource(),
                    "spawnpoint " + playerName + " " + bx + " " + by + " " + bz);
            server.getCommandManager().executeWithPrefix(
                    server.getCommandSource(),
                    "tp " + playerName + " " + (bx + 0.5) + " " + (by + 1.0) + " " + (bz + 0.5));

            owner.sendMessage(net.minecraft.text.Text.of(
                    "\u00A7a\u00A7l[Ship] \u00A7r\u00A7eYour ship is ready! Spawn point set to the deck."), false);

            LOGGER.info("[Ship] Owner {} teleported to deck + spawn set", owner.getNameForScoreboard());
        } else {
            LOGGER.warn("[Ship] Owner {} not online — spawn not set", ownerUuid);
        }
    }

    /** Get an active ship by UUID. */
    public ActiveShip getShip(UUID shipId) {
        return ships.get(shipId);
    }

    /** Get the number of active ships. */
    public int shipCount() {
        return ships.size();
    }

    /** Get all active ships (for protection checks, etc.). */
    public java.util.Map<UUID, ActiveShip> getActiveShips() {
        return ships;
    }

    /** Get the mover for direct access if needed. */
    public ShipMover getMover() {
        return mover;
    }

    // -----------------------------------------------------------------------
    // Safe ocean location finder
    // -----------------------------------------------------------------------

    /**
     * Search for a safe ocean location near the given position using a
     * spiral outward pattern. "Safe" means:
     * <ul>
     *   <li>The biome is an ocean variant</li>
     *   <li>The area has at least {@code MIN_OCEAN_DEPTH} blocks of water</li>
     *   <li>The footprint fits without hitting land</li>
     * </ul>
     */
    private BlockPos findSafeOcean(ServerWorld world, BlockPos center, int shipWidth, int shipDepth) {
        // Spiral search outward from center
        for (int radius = 0; radius <= OCEAN_SEARCH_RADIUS; radius += SEARCH_STEP) {
            for (int dx = -radius; dx <= radius; dx += SEARCH_STEP) {
                for (int dz = -radius; dz <= radius; dz += SEARCH_STEP) {
                    // Only check the perimeter of each ring (skip interior)
                    if (Math.abs(dx) != radius && Math.abs(dz) != radius && radius > 0) continue;

                    int cx = center.getX() + dx;
                    int cz = center.getZ() + dz;

                    if (isOceanSafe(world, cx, cz, shipWidth, shipDepth)) {
                        return new BlockPos(cx, 0, cz);
                    }
                }
            }
        }
        return null;
    }

    /**
     * Check if a rectangular area is safe ocean for ship placement.
     * Samples the corners and center rather than every block for speed.
     */
    private boolean isOceanSafe(ServerWorld world, int cx, int cz, int width, int depth) {
        // Sample 9 points: corners + edge midpoints + center
        int[][] samples = {
                {cx, cz},
                {cx + width, cz},
                {cx, cz + depth},
                {cx + width, cz + depth},
                {cx + width / 2, cz},
                {cx + width / 2, cz + depth},
                {cx, cz + depth / 2},
                {cx + width, cz + depth / 2},
                {cx + width / 2, cz + depth / 2},
        };

        for (int[] sample : samples) {
            BlockPos pos = new BlockPos(sample[0], world.getSeaLevel(), sample[1]);

            // Check biome
            var biomeEntry = world.getBiome(pos);
            boolean isOcean = OCEAN_BIOMES.stream()
                    .anyMatch(key -> biomeEntry.matchesKey(key));
            if (!isOcean) return false;

            // Check water depth — surface should be water, with at least
            // MIN_OCEAN_DEPTH blocks of water below sea level
            int surfaceY = world.getTopY(Heightmap.Type.OCEAN_FLOOR, sample[0], sample[1]);
            int waterDepth = world.getSeaLevel() - surfaceY;
            if (waterDepth < MIN_OCEAN_DEPTH) return false;
        }

        return true;
    }
}
