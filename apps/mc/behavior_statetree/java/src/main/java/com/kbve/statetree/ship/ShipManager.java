package com.kbve.statetree.ship;

import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
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

    /** Active ships keyed by ship UUID. */
    private final ConcurrentHashMap<UUID, ActiveShip> ships = new ConcurrentHashMap<>();

    /** Chunked block relocation engine. */
    private final ShipMover mover = new ShipMover();

    /** Record of an active ship in the world. */
    public static final class ActiveShip {
        public final UUID shipId;
        public final UUID ownerUuid;
        public final String shipName;
        public BlockPos anchor;
        public final ShipData data;
        public ShipEntity entity;

        ActiveShip(UUID shipId, UUID ownerUuid, String shipName, BlockPos anchor, ShipData data) {
            this.shipId = shipId;
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
        LOGGER.info("[Ship] Placing '{}' at {} (owner={})", data.name(), anchor.toShortString(), ownerUuid);

        // Place all blocks from the schematic
        int placed = 0;
        for (Map.Entry<BlockPos, BlockState> entry : data.blocks().entrySet()) {
            BlockPos worldPos = anchor.add(entry.getKey());
            world.setBlockState(worldPos, entry.getValue());
            placed++;

            // Yield occasionally for very large schematics to avoid tick lag
            // (In production, this should be chunked across multiple ticks)
        }

        LOGGER.info("[Ship] Placed {} blocks for '{}' (id={})", placed, data.name(), shipId);

        // Spawn the invisible anchor entity at the center of the ship
        ShipEntity entity = ShipEntityTypes.SHIP.create(world);
        if (entity != null) {
            double centerX = anchor.getX() + data.sizeX() / 2.0;
            double centerZ = anchor.getZ() + data.sizeZ() / 2.0;
            entity.setPosition(centerX, anchor.getY() + 1.0, centerZ);
            entity.setShipId(shipId);
            entity.setOwnerUuid(ownerUuid);
            world.spawnEntity(entity);
            LOGGER.info("[Ship] Spawned anchor entity at [{}, {}, {}]",
                    centerX, anchor.getY() + 1, centerZ);
        }

        ActiveShip ship = new ActiveShip(shipId, ownerUuid, data.name(), anchor, data);
        ship.entity = entity;
        ships.put(shipId, ship);

        return shipId;
    }

    /**
     * Remove all blocks belonging to a ship, despawn its entity, and untrack it.
     */
    public boolean removeShip(ServerWorld world, UUID shipId) {
        ActiveShip ship = ships.remove(shipId);
        if (ship == null) return false;

        int removed = 0;
        for (BlockPos offset : ship.data.blocks().keySet()) {
            BlockPos worldPos = ship.anchor.add(offset);
            world.setBlockState(worldPos, Blocks.AIR.getDefaultState());
            removed++;
        }

        // Despawn the anchor entity
        if (ship.entity != null && ship.entity.isAlive()) {
            ship.entity.discard();
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
        if (ship == null || ship.entity == null) return;
        if (mover.isMoving(shipId)) return; // Wait for current move to finish

        float heading = ship.entity.getHeading();
        double rad = Math.toRadians(heading);
        int dx = (int) Math.round(-Math.sin(rad) * distance);
        int dz = (int) Math.round(Math.cos(rad) * distance);

        BlockPos newAnchor = ship.anchor.add(dx, 0, dz);
        mover.queueMove(shipId, ship.data, ship.anchor, newAnchor);
        ship.anchor = newAnchor;

        // Move the entity to the new anchor center
        double centerX = newAnchor.getX() + ship.data.sizeX() / 2.0;
        double centerZ = newAnchor.getZ() + ship.data.sizeZ() / 2.0;
        ship.entity.setPosition(centerX, newAnchor.getY() + 1.0, centerZ);
    }

    /**
     * Tick the ship manager — processes chunked block relocations.
     * Call once per server tick.
     */
    public void tick(ServerWorld world) {
        mover.tick(world);
    }

    /** Get an active ship by UUID. */
    public ActiveShip getShip(UUID shipId) {
        return ships.get(shipId);
    }

    /** Get the number of active ships. */
    public int shipCount() {
        return ships.size();
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
