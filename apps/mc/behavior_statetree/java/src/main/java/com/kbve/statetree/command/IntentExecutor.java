package com.kbve.statetree.command;

import com.kbve.statetree.AiCreatureManager;
import net.minecraft.entity.Entity;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.server.world.ServerWorld;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

/**
 * Dual-channel budgeted command executor. Drains the entity inbox and
 * world inbox independently, each with its own per-tick budget from
 * {@link IntentChannel}.
 *
 * <p>Entity intents are drained every tick (cheap, high-frequency).
 * World intents are drained on a separate cadence controlled by the
 * orchestrator — typically every 2 ticks to spread expensive mutations.
 *
 * <p>Stale intents (epoch mismatch, dead entity) are dropped at dequeue
 * time so they never consume budget.
 */
public final class IntentExecutor {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    /** Max intent envelopes drained per channel per call. */
    private static final int MAX_INTENTS_PER_DRAIN = 64;

    private final IntentInbox entityInbox;
    private final IntentInbox worldInbox;
    private final MobCommandApplier mobApplier;
    private final WorldCommandApplier worldApplier;
    private final AiCreatureManager creatureManager;
    private final BudgetMetrics metrics;

    public IntentExecutor(IntentInbox entityInbox,
                          IntentInbox worldInbox,
                          MobCommandApplier mobApplier,
                          WorldCommandApplier worldApplier,
                          AiCreatureManager creatureManager,
                          BudgetMetrics metrics) {
        this.entityInbox = entityInbox;
        this.worldInbox = worldInbox;
        this.mobApplier = mobApplier;
        this.worldApplier = worldApplier;
        this.creatureManager = creatureManager;
        this.metrics = metrics;
    }

    /**
     * Drain and apply entity-scoped commands (every tick).
     * Budget: {@link IntentChannel#ENTITY} maxCommandsPerTick.
     */
    public void applyEntityChannel(CommandContext worldCtx) {
        int budget = IntentChannel.ENTITY.maxCommandsPerTick();
        int applied = drainEntityIntents(worldCtx, budget);
        if (applied >= budget) {
            metrics.recordMobBudgetExhausted();
        }
    }

    /**
     * Drain and apply world-scoped commands (throttled cadence).
     * Budget: {@link IntentChannel#WORLD} maxCommandsPerTick.
     */
    public void applyWorldChannel(CommandContext worldCtx) {
        int budget = IntentChannel.WORLD.maxCommandsPerTick();
        int applied = drainWorldIntents(worldCtx, budget);
        if (applied >= budget) {
            metrics.recordWorldBudgetExhausted();
        }
    }

    // ------------------------------------------------------------------
    // Entity channel drain
    // ------------------------------------------------------------------

    private int drainEntityIntents(CommandContext worldCtx, int commandBudget) {
        ServerWorld world = worldCtx.world();
        int commandsApplied = 0;

        List<DecodedIntent> batch = entityInbox.drain(MAX_INTENTS_PER_DRAIN);
        for (DecodedIntent intent : batch) {
            if (commandsApplied >= commandBudget) break;

            int entityId = intent.entityId();

            // Epoch-stale check at dequeue time
            if (!creatureManager.isManaged(entityId)) {
                metrics.recordEpochStaleDrop();
                continue;
            }
            if (intent.epoch() != creatureManager.getEpoch(entityId)) {
                metrics.recordEpochStaleDrop();
                continue;
            }

            Entity entity = world.getEntityById(entityId);
            if (entity == null || !entity.isAlive()) {
                metrics.recordEntityDeadDrop();
                continue;
            }
            if (!(entity instanceof MobEntity mob)) {
                metrics.recordEntityDeadDrop();
                continue;
            }

            CommandContext mobCtx = worldCtx.withMob(mob);
            for (AiCommand cmd : intent.commands()) {
                if (commandsApplied >= commandBudget) break;
                mobApplier.apply(mobCtx, cmd);
                commandsApplied++;
                metrics.recordMobCommandApplied();
            }
        }
        return commandsApplied;
    }

    // ------------------------------------------------------------------
    // World channel drain
    // ------------------------------------------------------------------

    private int drainWorldIntents(CommandContext worldCtx, int commandBudget) {
        int commandsApplied = 0;

        List<DecodedIntent> batch = worldInbox.drain(MAX_INTENTS_PER_DRAIN);
        for (DecodedIntent intent : batch) {
            if (commandsApplied >= commandBudget) break;

            for (AiCommand cmd : intent.commands()) {
                if (commandsApplied >= commandBudget) break;
                worldApplier.apply(worldCtx, cmd);
                commandsApplied++;
                metrics.recordWorldCommandApplied();
            }
        }
        return commandsApplied;
    }
}
