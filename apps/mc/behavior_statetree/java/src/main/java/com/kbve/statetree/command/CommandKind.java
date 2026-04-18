package com.kbve.statetree.command;

/**
 * Every command Rust can emit. The string exists only at the JSON decode
 * boundary — after that, dispatch is by enum ordinal.
 *
 * <p>Mob commands target a specific tracked entity ({@code entity_id != 0}).
 * World commands target the world itself ({@code entity_id == 0}).
 */
public enum CommandKind {

    // ── Mob commands (entity-scoped) ─────────────────────────────────────
    MOVE_TO("MoveTo"),
    ATTACK("Attack"),
    IDLE("Idle"),
    SPEAK("Speak"),
    CALL_FOR_HELP("CallForHelp"),
    POOP_POISON("PoopPoison"),
    PLACE_BLOCK("PlaceBlock"),
    TELEPORT("Teleport"),
    SHOOT_ARROW("ShootArrow"),
    SET_GOAL("SetGoal"),

    // ── World commands (world-scoped) ────────────────────────────────────
    SPAWN_CREATURE("SpawnCreature"),
    SPAWN_CREATURE_PACK("SpawnCreaturePack"),
    DESPAWN("Despawn"),
    MOVE_SHIP("MoveShip"),
    DESPAWN_SHIP("DespawnShip"),
    SPAWN_SHIP("SpawnShip"),

    // ── Legacy spawn commands (decoded into SPAWN_CREATURE) ──────────────
    // Kept for backward compatibility with existing Rust emitters.
    // IntentDecoder normalizes these to SPAWN_CREATURE before enqueueing.
    SPAWN_SKELETON("SpawnSkeleton"),
    SPAWN_PET_DOG("SpawnPetDog"),
    SPAWN_PET_PARROT("SpawnPetParrot"),
    SPAWN_SKELETON_MELEE("SpawnSkeletonMelee"),
    SPAWN_SKELETON_MAGE("SpawnSkeletonMage"),
    SPAWN_SKELETON_ARCHER("SpawnSkeletonArcher"),
    SPAWN_SKELETON_HORSEMEN_PACK("SpawnSkeletonHorsemenPack");

    private final String wireKey;

    CommandKind(String wireKey) {
        this.wireKey = wireKey;
    }

    /** JSON key as it appears on the wire from Rust. */
    public String wireKey() {
        return wireKey;
    }

    /**
     * Resolve a JSON key to its enum. Returns {@code null} for unknown keys
     * (forward compatibility — new Rust commands won't crash old Java).
     */
    public static CommandKind fromWireKey(String key) {
        for (CommandKind kind : VALUES) {
            if (kind.wireKey.equals(key)) return kind;
        }
        return null;
    }

    private static final CommandKind[] VALUES = values();
}
