package com.kbve.statetree.command;

import com.kbve.statetree.CreatureKind;
import com.kbve.statetree.CreatureKinds;
import com.kbve.statetree.ship.SchematicLoader;
import com.kbve.statetree.ship.ShipData;
import net.minecraft.entity.Entity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.EnumMap;
import java.util.HashMap;
import java.util.Map;

/**
 * Registry-backed applier for world-scoped commands. Handles generic
 * creature spawning via tag-based {@link CreatureKind} lookup, ship
 * operations, and entity despawning.
 */
public final class WorldCommandApplier {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    /** Creature tag → CreatureKind. Populated once at construction. */
    private final Map<String, CreatureKindEntry> creatureRegistry = new HashMap<>();

    @SuppressWarnings("rawtypes")
    private final Map<CommandKind, CommandApplier> registry = new EnumMap<>(CommandKind.class);

    private record CreatureKindEntry(CreatureKind kind, boolean defaultTamed) {}

    public WorldCommandApplier() {
        // Creature tag registry — add new creature types here, not in
        // the command dispatch. Tags must match CreatureKind.tag().
        registerCreature(CreatureKinds.SKELETON, false);
        registerCreature(CreatureKinds.SKELETON_MELEE, false);
        registerCreature(CreatureKinds.SKELETON_MAGE, false);
        registerCreature(CreatureKinds.SKELETON_ARCHER, false);
        registerCreature(CreatureKinds.SKELETON_HORSEMAN, false);
        registerCreature(CreatureKinds.PET_DOG, true);
        registerCreature(CreatureKinds.PET_PARROT, true);

        // Command registry
        register(CommandKind.SPAWN_CREATURE, this::applySpawnCreature);
        register(CommandKind.SPAWN_CREATURE_PACK, this::applySpawnCreaturePack);
        register(CommandKind.DESPAWN, this::applyDespawn);
        register(CommandKind.MOVE_SHIP, this::applyMoveShip);
        register(CommandKind.DESPAWN_SHIP, this::applyDespawnShip);
        register(CommandKind.SPAWN_SHIP, this::applySpawnShip);
    }

    private void registerCreature(CreatureKind kind, boolean defaultTamed) {
        creatureRegistry.put(kind.tag(), new CreatureKindEntry(kind, defaultTamed));
    }

    private <T extends AiCommand> void register(CommandKind kind, CommandApplier<T> applier) {
        registry.put(kind, applier);
    }

    @SuppressWarnings("unchecked")
    public boolean apply(CommandContext ctx, AiCommand command) {
        CommandApplier applier = registry.get(command.kind());
        if (applier == null) return false;
        applier.apply(ctx, command);
        return true;
    }

    // ------------------------------------------------------------------
    // Appliers
    // ------------------------------------------------------------------

    private void applySpawnCreature(CommandContext ctx, AiCommand.SpawnCreature cmd) {
        CreatureKindEntry entry = creatureRegistry.get(cmd.creatureTag());
        if (entry == null) {
            LOGGER.warn("[AI] Unknown creature tag '{}' in SpawnCreature", cmd.creatureTag());
            return;
        }
        boolean tamed = cmd.tamed() || entry.defaultTamed();
        for (int i = 0; i < cmd.count(); i++) {
            ctx.creatureManager().spawnNearPlayer(
                    ctx.world(), entry.kind(), cmd.nearPlayer(), cmd.radius(), tamed);
        }
    }

    private void applySpawnCreaturePack(CommandContext ctx, AiCommand.SpawnCreaturePack cmd) {
        for (var packEntry : cmd.entries()) {
            CreatureKindEntry entry = creatureRegistry.get(packEntry.creatureTag());
            if (entry == null) {
                LOGGER.warn("[AI] Unknown creature tag '{}' in pack", packEntry.creatureTag());
                continue;
            }
            boolean tamed = packEntry.tamed() || entry.defaultTamed();
            for (int i = 0; i < packEntry.count(); i++) {
                ctx.creatureManager().spawnNearPlayer(
                        ctx.world(), entry.kind(), cmd.nearPlayer(), cmd.radius(), tamed);
            }
        }
    }

    private void applyDespawn(CommandContext ctx, AiCommand.Despawn cmd) {
        ctx.creatureManager().despawnEntity(ctx.world(), cmd.targetEntityId());
    }

    private void applyMoveShip(CommandContext ctx, AiCommand.MoveShip cmd) {
        if (ctx.shipManager() == null) {
            LOGGER.warn("[AI] MoveShip ignored: ship manager not initialized");
            return;
        }
        try {
            ctx.shipManager().moveShip(java.util.UUID.fromString(cmd.shipId()), cmd.distance());
        } catch (IllegalArgumentException e) {
            LOGGER.warn("[AI] Invalid ship UUID in MoveShip: {}", cmd.shipId());
        }
    }

    private void applyDespawnShip(CommandContext ctx, AiCommand.DespawnShip cmd) {
        if (ctx.shipManager() == null) {
            LOGGER.warn("[AI] DespawnShip ignored: ship manager not initialized");
            return;
        }
        try {
            ctx.shipManager().removeShip(ctx.world(), java.util.UUID.fromString(cmd.shipId()));
        } catch (IllegalArgumentException e) {
            LOGGER.warn("[AI] Invalid ship UUID in DespawnShip: {}", cmd.shipId());
        }
    }

    private void applySpawnShip(CommandContext ctx, AiCommand.SpawnShip cmd) {
        if (ctx.shipManager() == null) {
            LOGGER.warn("[AI] SpawnShip ignored: ship manager not initialized");
            return;
        }
        Entity player = ctx.world().getEntityById(cmd.nearPlayer());
        if (player != null) {
            ShipData data = SchematicLoader.loadFromResource(
                    cmd.shipName(), "/schematics/" + cmd.shipName() + ".nbt");
            if (data != null) {
                ctx.shipManager().placeShip(ctx.world(), data, player.getUuid(), player.getBlockPos());
            }
        }
    }
}
