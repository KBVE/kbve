package com.kbve.statetree.ship;

import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Manages active ships as lightweight entities rendered via BBModel.
 *
 * <p>No blocks are placed or tracked — the ship is entirely an entity
 * with a client-side BBModel renderer. This class handles:
 * <ul>
 *   <li>Spawning a {@link ShipEntity} at a position</li>
 *   <li>Tracking active ships by UUID</li>
 *   <li>Removing ships (discard entity)</li>
 *   <li>WASD movement (delegated to ShipEntity.tick())</li>
 * </ul>
 */
public final class ShipManager {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    /** Height above the player to spawn airships. */
    private static final int SPAWN_HEIGHT_OFFSET = 5;

    /** Active ships keyed by UUID. */
    private final Map<UUID, ShipEntity> activeShips = new ConcurrentHashMap<>();

    /**
     * Spawn an entity-based ship near the given position.
     *
     * @param modelName BBModel identifier (e.g. "immersive_aircraft/airship")
     * @return the spawned ShipEntity, or null on failure
     */
    public ShipEntity placeShip(ServerWorld world, String modelName,
                                UUID ownerUuid, BlockPos nearPos) {
        UUID shipId = UUID.randomUUID();

        ShipEntity entity = new ShipEntity(ShipEntityTypes.SHIP, world);
        entity.setShipId(shipId);
        entity.setOwnerUuid(ownerUuid);
        entity.setModelName(modelName);
        entity.setShipHealth(ShipEntity.MAX_HEALTH);
        entity.refreshPositionAndAngles(
                nearPos.getX() + 0.5,
                nearPos.getY() + SPAWN_HEIGHT_OFFSET,
                nearPos.getZ() + 0.5,
                0, 0);

        if (!world.spawnEntity(entity)) {
            LOGGER.warn("[Ship] Failed to spawn ship entity at {}", nearPos);
            return null;
        }

        activeShips.put(shipId, entity);

        // Vanilla entity tracking handles spawn/despawn sync to clients —
        // world.spawnEntity() above already sent the spawn packet, and
        // entity.discard() handles despawn below.

        LOGGER.info("[Ship] Spawned '{}' (id={}) at [{}, {}, {}] for owner {}",
                modelName, shipId,
                nearPos.getX(), nearPos.getY() + SPAWN_HEIGHT_OFFSET, nearPos.getZ(),
                ownerUuid);
        return entity;
    }

    /**
     * Remove a ship by UUID — discards the entity.
     */
    public void removeShip(ServerWorld world, UUID shipId) {
        ShipEntity entity = activeShips.remove(shipId);
        if (entity != null) {
            entity.removeAllPassengers();
            entity.discard();
            LOGGER.info("[Ship] Removed ship {}", shipId);
        }
    }

    /**
     * Move a ship forward by the given number of blocks along its heading.
     * For entity-based ships this is a direct position update.
     */
    public void moveShip(UUID shipId, int distance) {
        ShipEntity entity = activeShips.get(shipId);
        if (entity == null) return;

        double rad = Math.toRadians(entity.getHeading());
        double dx = -Math.sin(rad) * distance;
        double dz = Math.cos(rad) * distance;
        entity.setPosition(entity.getX() + dx, entity.getY(), entity.getZ() + dz);
    }

    /**
     * Teleport a player to the ship's helm and mount them.
     */
    public void boardShip(ServerWorld world, net.minecraft.server.network.ServerPlayerEntity player, UUID shipId) {
        ShipEntity entity = activeShips.get(shipId);
        if (entity == null) {
            LOGGER.warn("[Ship] Cannot board — ship {} not found", shipId);
            return;
        }
        player.startRiding(entity);
    }

    /**
     * Remove all active ships (dev tool).
     */
    public void clearAll(ServerWorld world) {
        int tracked = activeShips.size();
        for (var entry : activeShips.entrySet()) {
            entry.getValue().removeAllPassengers();
            entry.getValue().discard();
        }
        activeShips.clear();

        int orphans = 0;
        for (var entity : world.iterateEntities()) {
            if (entity instanceof ShipEntity ship && ship.isAlive()) {
                ship.removeAllPassengers();
                ship.discard();
                orphans++;
            }
        }
        LOGGER.info("[Ship] Cleared {} tracked + {} orphan ships", tracked, orphans);
    }

    /**
     * Server tick — no-op for entity-based ships (entity.tick() handles movement).
     */
    public void tick(ServerWorld world) {
        // Evict dead/discarded entities
        activeShips.entrySet().removeIf(e -> !e.getValue().isAlive());
    }

    public ShipEntity getShip(UUID shipId) {
        return activeShips.get(shipId);
    }

    public Map<UUID, ShipEntity> getActiveShips() {
        return activeShips;
    }
}
