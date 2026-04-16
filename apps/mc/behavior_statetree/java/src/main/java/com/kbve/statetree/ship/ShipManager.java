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
     *  For the 20k-block airship, 25k/tick = 1-tick full relocation,
     *  giving smooth continuous WASD movement. Large ships (Dark Reaper)
     *  still get chunked across multiple ticks. */
    private static final int PLACEMENT_BLOCKS_PER_TICK = 25000;

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

            // Airships spawn in open sky — only clear at exact ship block
            // positions (handles the rare case where a tree or hill pokes
            // into the ship volume). No waterline buffer needed.
            clearPositions = new java.util.ArrayList<>(data.blocks().keySet());
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
        /** Rideable helm entity on the deck. Null until placement completes. */
        public ShipEntity helmEntity = null;
        /** Bed positions placed on deck (foot + head). Cleared on despawn. */
        public BlockPos bedFoot = null;
        public BlockPos bedHead = null;

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
        // Airships spawn directly above the player — in the sky, centered
        // on their XZ position. No ocean finding needed.
        int flightY = Math.max(searchFrom.getY() + 30, world.getSeaLevel() + 40);
        BlockPos anchor = new BlockPos(
                searchFrom.getX() - data.sizeX() / 2,
                flightY,
                searchFrom.getZ() - data.sizeZ() / 2
        );

        UUID shipId = UUID.randomUUID();
        LOGGER.info("[Ship] Queuing '{}' at {} ({} blocks, owner={})",
                data.name(), anchor.toShortString(), data.blockCount(), ownerUuid);

        // Queue chunked placement via the mover — same engine used for
        // movement. This spreads 400k blocks across multiple ticks instead
        // of freezing the server thread.
        ActiveShip ship = new ActiveShip(shipId, ownerUuid, data.name(), anchor, data);
        ships.put(shipId, ship);

        // Persist to Rust ship DB
        persistShip(ship);

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

        // Notify clients to stop tracking this ship
        ShipNetworking.broadcastShipDespawn(world, shipId);

        // Remove from persistent store
        if (com.kbve.statetree.NativeRuntime.isLoaded()) {
            com.kbve.statetree.NativeRuntime.deleteShip(shipId.toString());
        }

        // Use live block tracker — only clears blocks that still exist
        // (broken blocks were already removed from the tracker)
        int removed = 0;
        for (BlockPos offset : ship.blockTracker.blocks()) {
            BlockPos worldPos = ship.anchor.add(offset);
            world.setBlockState(worldPos, Blocks.AIR.getDefaultState());
            removed++;
        }

        // Clear the bed
        if (ship.bedFoot != null) {
            world.setBlockState(ship.bedFoot, Blocks.AIR.getDefaultState());
        }
        if (ship.bedHead != null) {
            world.setBlockState(ship.bedHead, Blocks.AIR.getDefaultState());
        }

        // Despawn the helm entity
        if (ship.helmEntity != null && ship.helmEntity.isAlive()) {
            ship.helmEntity.discard();
        }

        LOGGER.info("[Ship] Removed {} blocks + bed + helm for '{}' (id={})", removed, ship.shipName, shipId);
        return true;
    }

    /**
     * Move a ship forward along its heading by the given distance.
     * (Legacy — kept for compatibility with /moveship command.)
     */
    public void moveShip(UUID shipId, int distance) {
        ActiveShip ship = ships.get(shipId);
        if (ship == null) return;
        if (mover.isMoving(shipId)) return;

        double rad = Math.toRadians(ship.heading);
        int dx = (int) Math.round(-Math.sin(rad) * distance);
        int dz = (int) Math.round(Math.cos(rad) * distance);

        BlockPos newAnchor = ship.anchor.add(dx, 0, dz);
        mover.queueMove(shipId, ship.data, ship.anchor, newAnchor);
        ship.anchor = newAnchor;
        persistShip(ship);
    }

    /**
     * Move a ship in a cardinal direction by the given deltas.
     * dx > 0 = east, dx < 0 = west, dz > 0 = south, dz < 0 = north,
     * dy > 0 = up, dy < 0 = down.
     */
    public void moveShipDirection(UUID shipId, int dx, int dy, int dz) {
        ActiveShip ship = ships.get(shipId);
        if (ship == null) return;
        if (mover.isMoving(shipId)) return;

        BlockPos newAnchor = ship.anchor.add(dx, dy, dz);
        mover.queueMove(shipId, ship.data, ship.anchor, newAnchor);
        ship.anchor = newAnchor;

        // Move the helm entity — passengers ride along automatically
        // via MC's passenger attachment system. Don't teleport passengers
        // directly (that dismounts them).
        if (ship.helmEntity != null && ship.helmEntity.isAlive()) {
            double newX = ship.helmEntity.getX() + dx;
            double newY = ship.helmEntity.getY() + dy;
            double newZ = ship.helmEntity.getZ() + dz;
            ship.helmEntity.setPosition(newX, newY, newZ);
            // Update passenger positions directly (without teleport/dismount)
            for (var passenger : ship.helmEntity.getPassengerList()) {
                passenger.setPosition(
                        passenger.getX() + dx,
                        passenger.getY() + dy,
                        passenger.getZ() + dz);
            }
        }

        // Persist new anchor so ships.json tracks the current position.
        // Without this, disconnecting mid-sail leaves the DB pointing at
        // the old location → /clearallships can't find the moved ship.
        persistShip(ship);
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
                    // Airships fly in the sky — clear anything in the way
                    // (trees, floating islands, mountain tops, fluids).
                    if (!existing.isAir()) {
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

                // Pre-cache the StructureTemplate for fast WASD movement
                String resourcePath = "/schematics/" + job.data.name() + ".nbt";
                mover.getOrLoadTemplate(world, job.data, resourcePath);

                // Spawn the helm entity on the deck so players can mount + WASD
                spawnHelmEntity(world, job.shipId, job.anchor, job.data);

                // Broadcast spawn to all clients so they start tracking the ship
                ActiveShip activeShip = ships.get(job.shipId);
                if (activeShip != null) {
                    ShipNetworking.broadcastShipSpawn(world, activeShip);
                }
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

        // Track bed positions so they get cleaned up on despawn
        for (var entry : ships.entrySet()) {
            if (entry.getValue().ownerUuid.equals(ownerUuid)) {
                entry.getValue().bedFoot = footPos;
                entry.getValue().bedHead = headPos;
                break;
            }
        }

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

            server.getCommandManager().parseAndExecute(
                    server.getCommandSource(),
                    "spawnpoint " + playerName + " " + bx + " " + by + " " + bz);
            server.getCommandManager().parseAndExecute(
                    server.getCommandSource(),
                    "tp " + playerName + " " + (bx + 0.5) + " " + (by + 1.0) + " " + (bz + 0.5));

            owner.sendMessage(net.minecraft.text.Text.of(
                    "\u00A7a\u00A7l[Ship] \u00A7r\u00A7eYour ship is ready! Spawn point set to the deck."), false);

            LOGGER.info("[Ship] Owner {} teleported to deck + spawn set", owner.getNameForScoreboard());
        } else {
            LOGGER.warn("[Ship] Owner {} not online — spawn not set", ownerUuid);
        }
    }

    // -----------------------------------------------------------------------
    // Helm entity — rideable ShipEntity on the deck
    // -----------------------------------------------------------------------

    /**
     * Spawn a ShipEntity on the deck near the bed. Players mount it to steer.
     */
    private void spawnHelmEntity(ServerWorld world, UUID shipId, BlockPos anchor, ShipData data) {
        ActiveShip ship = ships.get(shipId);
        if (ship == null) return;

        // Find deck position (same scan as placeBedOnDeck)
        int cx = data.sizeX() / 2;
        int cz = data.sizeZ() / 2;
        int deckY = -1;
        for (int y = data.sizeY() - 1; y >= 0; y--) {
            if (data.blocks().containsKey(new BlockPos(cx, y, cz))) {
                deckY = y + 1;
                break;
            }
        }
        if (deckY < 0) deckY = data.sizeY() / 2;

        ShipEntity entity = ShipEntityTypes.SHIP.create(world, net.minecraft.entity.SpawnReason.COMMAND);
        if (entity == null) {
            LOGGER.warn("[Ship] Failed to create helm entity for {}", shipId);
            return;
        }

        double hx = anchor.getX() + cx + 0.5;
        double hy = anchor.getY() + deckY + 1.0;
        double hz = anchor.getZ() + cz + 0.5;

        entity.setPosition(hx, hy, hz);
        entity.setShipId(shipId);
        entity.setOwnerUuid(ship.ownerUuid);
        world.spawnEntity(entity);

        ship.helmEntity = entity;
        LOGGER.info("[Ship] Helm entity spawned at [{}, {}, {}] for '{}'",
                hx, hy, hz, ship.shipName);
    }

    /**
     * Board a ship — teleport the player to the helm and mount them.
     *
     * @return true if the player was successfully mounted
     */
    public boolean boardShip(ServerWorld world, UUID shipId, net.minecraft.server.network.ServerPlayerEntity player) {
        ActiveShip ship = ships.get(shipId);
        if (ship == null) return false;

        if (ship.helmEntity == null || !ship.helmEntity.isAlive()) {
            // Respawn helm if it died
            spawnHelmEntity(world, shipId, ship.anchor, ship.data);
        }

        if (ship.helmEntity == null) return false;

        // Teleport player to the helm position
        double hx = ship.helmEntity.getX();
        double hy = ship.helmEntity.getY();
        double hz = ship.helmEntity.getZ();

        player.teleport(world, hx, hy, hz,
                java.util.Set.of(), player.getYaw(), player.getPitch(), false);

        // Mount the player on the entity
        player.startRiding(ship.helmEntity);

        LOGGER.info("[Ship] {} boarded '{}' at helm", player.getNameForScoreboard(), ship.shipName);
        return true;
    }

    // -----------------------------------------------------------------------
    // Persistence — saves ship state to Rust-side JSON file via JNI
    // -----------------------------------------------------------------------

    /** Persist a ship record to the Rust-side store. */
    private void persistShip(ActiveShip ship) {
        if (!com.kbve.statetree.NativeRuntime.isLoaded()) return;

        com.google.gson.JsonObject json = new com.google.gson.JsonObject();
        json.addProperty("ship_id", ship.shipId.toString());
        json.addProperty("owner_uuid", ship.ownerUuid.toString());
        json.addProperty("ship_name", ship.shipName);
        json.addProperty("anchor_x", ship.anchor.getX());
        json.addProperty("anchor_y", ship.anchor.getY());
        json.addProperty("anchor_z", ship.anchor.getZ());
        json.addProperty("heading", ship.heading);
        json.addProperty("block_count", ship.blockTracker.blockCount());
        json.addProperty("integrity", ship.blockTracker.integrity());

        com.kbve.statetree.NativeRuntime.saveShip(json.toString());
    }

    /** Initialize persistence and load saved ships into the manager.
     *  Takes a Shipyard so we can re-attach ShipData to restored records. */
    public void initPersistence(String dbPath, Shipyard shipyard) {
        if (!com.kbve.statetree.NativeRuntime.isLoaded()) {
            LOGGER.warn("[Ship] Native runtime not loaded — ship persistence disabled");
            return;
        }

        boolean ok = com.kbve.statetree.NativeRuntime.initShipDb(dbPath);
        if (!ok) {
            LOGGER.error("[Ship] Failed to initialize ship database at {}", dbPath);
            return;
        }

        // Load saved ships — we restore metadata only. The blocks are
        // already in the world (persisted by MC). We just re-track them
        // so /boardship, /despawnship, and protection work after restart.
        String json = com.kbve.statetree.NativeRuntime.loadAllShips();
        com.google.gson.JsonArray arr = new com.google.gson.Gson().fromJson(json, com.google.gson.JsonArray.class);
        if (arr == null || arr.isEmpty()) {
            LOGGER.info("[Ship] No saved ships to restore");
            return;
        }

        int restored = 0;
        int skipped = 0;
        for (var elem : arr) {
            com.google.gson.JsonObject obj = elem.getAsJsonObject();
            UUID shipId = UUID.fromString(obj.get("ship_id").getAsString());
            UUID ownerUuid = UUID.fromString(obj.get("owner_uuid").getAsString());
            String shipName = obj.get("ship_name").getAsString();
            int ax = obj.get("anchor_x").getAsInt();
            int ay = obj.get("anchor_y").getAsInt();
            int az = obj.get("anchor_z").getAsInt();
            float heading = obj.has("heading") ? obj.get("heading").getAsFloat() : 0.0f;

            BlockPos anchor = new BlockPos(ax, ay, az);
            if (ships.containsKey(shipId)) continue;

            // Look up the ShipData from the Shipyard by name
            ShipData data = shipyard.getBlueprint(shipName);
            if (data == null) {
                // Blueprint not loaded yet — trigger async load, skip restore for now.
                // User can run /clearallships or wait and retry.
                LOGGER.warn("[Ship] Cannot restore '{}' (id={}) — blueprint not loaded, triggering load",
                        shipName, shipId);
                shipyard.ensureLoaded(shipName);
                skipped++;
                continue;
            }

            ActiveShip ship = new ActiveShip(shipId, ownerUuid, shipName, anchor, data);
            ship.heading = heading;
            ships.put(shipId, ship);
            restored++;

            LOGGER.info("[Ship] Restored '{}' at {} (id={})",
                    shipName, anchor.toShortString(), shipId);
        }

        LOGGER.info("[Ship] Persistence initialized — restored {} ship(s), skipped {} (blueprints loading)",
                restored, skipped);
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
     * Search for a safe ocean location. Uses MC's built-in biome locator
     * to find the nearest deep ocean, then verifies the footprint fits.
     * Falls back to spiral search if the biome locator doesn't find one.
     */
    private BlockPos findSafeOcean(ServerWorld world, BlockPos center, int shipWidth, int shipDepth) {
        // Step 1: Use MC's locate biome to find nearest deep ocean
        // This searches up to 6400 blocks (same as /locate biome)
        var deepOceanEntry = world.locateBiome(
                biome -> OCEAN_BIOMES.stream().anyMatch(biome::matchesKey),
                center, 6400, 32, 64);

        if (deepOceanEntry != null) {
            BlockPos found = deepOceanEntry.getFirst();
            LOGGER.info("[Ship] Biome locator found ocean at {}", found.toShortString());

            // Verify the footprint fits at this location
            if (isOceanSafe(world, found.getX(), found.getZ(), shipWidth, shipDepth)) {
                return new BlockPos(found.getX(), 0, found.getZ());
            }

            // The exact biome point might not fit the ship — spiral search nearby
            for (int radius = SEARCH_STEP; radius <= OCEAN_SEARCH_RADIUS; radius += SEARCH_STEP) {
                for (int dx = -radius; dx <= radius; dx += SEARCH_STEP) {
                    for (int dz = -radius; dz <= radius; dz += SEARCH_STEP) {
                        if (Math.abs(dx) != radius && Math.abs(dz) != radius) continue;
                        int cx = found.getX() + dx;
                        int cz = found.getZ() + dz;
                        if (isOceanSafe(world, cx, cz, shipWidth, shipDepth)) {
                            return new BlockPos(cx, 0, cz);
                        }
                    }
                }
            }
        }

        // Fallback: spiral search from player position
        LOGGER.info("[Ship] Biome locator failed, falling back to spiral search from {}", center.toShortString());
        for (int radius = 0; radius <= OCEAN_SEARCH_RADIUS; radius += SEARCH_STEP) {
            for (int dx = -radius; dx <= radius; dx += SEARCH_STEP) {
                for (int dz = -radius; dz <= radius; dz += SEARCH_STEP) {
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
