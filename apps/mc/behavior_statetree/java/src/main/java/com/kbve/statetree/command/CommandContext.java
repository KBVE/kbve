package com.kbve.statetree.command;

import com.kbve.statetree.AiCreatureManager;
import com.kbve.statetree.ScaffoldTracker;
import com.kbve.statetree.ship.ShipManager;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.server.world.ServerWorld;
import org.jetbrains.annotations.Nullable;

/**
 * Execution context passed to every {@link CommandApplier}. Provides
 * access to the world, the target mob (for mob commands), and shared
 * services without appliers needing to hold references themselves.
 */
public record CommandContext(
        ServerWorld world,
        @Nullable MobEntity mob,
        AiCreatureManager creatureManager,
        ScaffoldTracker scaffoldTracker,
        @Nullable ShipManager shipManager
) {
    /** Convenience — world commands use this. */
    public static CommandContext forWorld(ServerWorld world,
                                         AiCreatureManager creatureManager,
                                         ScaffoldTracker scaffoldTracker,
                                         @Nullable ShipManager shipManager) {
        return new CommandContext(world, null, creatureManager, scaffoldTracker, shipManager);
    }

    /** Convenience — mob commands use this. */
    public CommandContext withMob(MobEntity mob) {
        return new CommandContext(world, mob, creatureManager, scaffoldTracker, shipManager);
    }
}
