package com.kbve.statetree.command;

/**
 * Typed command model — the sealed interface that every command Rust can
 * emit implements. String-keyed JSON only exists at the decode boundary;
 * after decoding, everything is a typed record.
 *
 * <p>Mob commands carry an {@code entityId} + {@code epoch} for the target
 * mob. World commands carry {@code entityId == 0}.
 */
public sealed interface AiCommand {

    /** Which kind this command is — used for registry dispatch. */
    CommandKind kind();

    // =====================================================================
    // Mob commands (entity-scoped)
    // =====================================================================

    record MoveTo(double x, double y, double z, double speed) implements AiCommand {
        @Override public CommandKind kind() { return CommandKind.MOVE_TO; }
    }

    record Attack(int targetEntityId) implements AiCommand {
        @Override public CommandKind kind() { return CommandKind.ATTACK; }
    }

    record Idle() implements AiCommand {
        @Override public CommandKind kind() { return CommandKind.IDLE; }
    }

    record Speak(String message) implements AiCommand {
        @Override public CommandKind kind() { return CommandKind.SPEAK; }
    }

    record CallForHelp(int count) implements AiCommand {
        @Override public CommandKind kind() { return CommandKind.CALL_FOR_HELP; }
    }

    record PoopPoison(int targetEntityId, int durationTicks, int amplifier) implements AiCommand {
        @Override public CommandKind kind() { return CommandKind.POOP_POISON; }
    }

    record PlaceBlock(int x, int y, int z, String blockType, int cleanupTicks) implements AiCommand {
        @Override public CommandKind kind() { return CommandKind.PLACE_BLOCK; }
    }

    record Teleport(double x, double y, double z) implements AiCommand {
        @Override public CommandKind kind() { return CommandKind.TELEPORT; }
    }

    record ShootArrow(int targetEntityId, float power) implements AiCommand {
        @Override public CommandKind kind() { return CommandKind.SHOOT_ARROW; }
    }

    record SetGoal(String goal) implements AiCommand {
        @Override public CommandKind kind() { return CommandKind.SET_GOAL; }
    }

    // =====================================================================
    // World commands (world-scoped)
    // =====================================================================

    /**
     * Generic spawn command — replaces all per-creature spawn branches.
     * {@code creatureTag} is resolved to a {@link com.kbve.statetree.CreatureKind}
     * via the registry.
     */
    record SpawnCreature(String creatureTag, int nearPlayer, int radius,
                         boolean tamed, int count) implements AiCommand {
        @Override public CommandKind kind() { return CommandKind.SPAWN_CREATURE; }
    }

    /**
     * Spawn a mixed pack of creatures. Each entry is a (tag, count) pair.
     * Supports cavalry + infantry combos like horsemen + foot archers.
     */
    record SpawnCreaturePack(int nearPlayer, int radius,
                             java.util.List<PackEntry> entries) implements AiCommand {
        @Override public CommandKind kind() { return CommandKind.SPAWN_CREATURE_PACK; }

        public record PackEntry(String creatureTag, int count, boolean tamed) {}
    }

    record Despawn(int targetEntityId) implements AiCommand {
        @Override public CommandKind kind() { return CommandKind.DESPAWN; }
    }

    record MoveShip(String shipId, int distance) implements AiCommand {
        @Override public CommandKind kind() { return CommandKind.MOVE_SHIP; }
    }

    record DespawnShip(String shipId) implements AiCommand {
        @Override public CommandKind kind() { return CommandKind.DESPAWN_SHIP; }
    }

    record SpawnShip(String shipName, int nearPlayer) implements AiCommand {
        @Override public CommandKind kind() { return CommandKind.SPAWN_SHIP; }
    }
}
