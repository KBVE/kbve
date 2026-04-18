package com.kbve.statetree.command;

/**
 * Authority channel for intent routing. Entity intents are cheap and
 * high-frequency (movement, combat). World intents are expensive
 * mutations (spawns, despawns, ship ops) that need tighter throttling.
 *
 * <p>Each channel has its own inbox, budget cap, and drain cadence.
 */
public enum IntentChannel {

    /** Entity-scoped AI intents: MoveTo, Attack, Idle, Speak, ShootArrow, etc. */
    ENTITY(256, 128),

    /** World-scoped orchestration: Spawn, Despawn, PlaceBlock, ship ops. */
    WORLD(64, 16);

    private final int inboxCapacity;
    private final int maxCommandsPerTick;

    IntentChannel(int inboxCapacity, int maxCommandsPerTick) {
        this.inboxCapacity = inboxCapacity;
        this.maxCommandsPerTick = maxCommandsPerTick;
    }

    /** Max intents buffered in this channel's inbox. */
    public int inboxCapacity() {
        return inboxCapacity;
    }

    /** Max commands applied from this channel per tick. */
    public int maxCommandsPerTick() {
        return maxCommandsPerTick;
    }
}
