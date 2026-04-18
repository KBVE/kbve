package com.kbve.statetree.command;

import com.kbve.statetree.AiCreatureManager;
import net.minecraft.entity.Entity;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.server.world.ServerWorld;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

/**
 * Budgeted command executor with split caps for entity vs world commands.
 *
 * <p>Each tick, drains a bounded number of intents from the
 * {@link IntentInbox} and applies them through typed registries. Stale
 * intents (epoch mismatch, dead entity) are dropped at dequeue time —
 * before they consume budget — so expensive world mutations don't get
 * crowded out by dead-entity checks.
 *
 * <p>Budget caps (per tick):
 * <ul>
 *   <li>{@link #MAX_INTENTS_PER_TICK} — max intent envelopes drained</li>
 *   <li>{@link #MAX_MOB_COMMANDS} — max entity-scoped commands applied</li>
 *   <li>{@link #MAX_WORLD_COMMANDS} — max world-scoped commands applied
 *       (spawns, despawns, ship ops — expensive mutations)</li>
 * </ul>
 */
public final class IntentExecutor {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    /** Max intent envelopes drained per tick. */
    private static final int MAX_INTENTS_PER_TICK = 64;

    /** Max entity-scoped commands (MoveTo, Attack, etc.) per tick. Cheap. */
    private static final int MAX_MOB_COMMANDS = 128;

    /** Max world-scoped commands (Spawn, Despawn, ship ops) per tick. Expensive. */
    private static final int MAX_WORLD_COMMANDS = 16;

    private final IntentInbox inbox;
    private final MobCommandApplier mobApplier;
    private final WorldCommandApplier worldApplier;
    private final AiCreatureManager creatureManager;
    private final BudgetMetrics metrics;

    private int mobCommandsThisTick;
    private int worldCommandsThisTick;

    public IntentExecutor(IntentInbox inbox,
                          MobCommandApplier mobApplier,
                          WorldCommandApplier worldApplier,
                          AiCreatureManager creatureManager,
                          BudgetMetrics metrics) {
        this.inbox = inbox;
        this.mobApplier = mobApplier;
        this.worldApplier = worldApplier;
        this.creatureManager = creatureManager;
        this.metrics = metrics;
    }

    /**
     * Drain and apply a budgeted batch of commands for this tick.
     * Call once per server tick from the orchestrator.
     */
    public void applyBudgeted(CommandContext worldCtx) {
        mobCommandsThisTick = 0;
        worldCommandsThisTick = 0;

        List<DecodedIntent> batch = inbox.drain(MAX_INTENTS_PER_TICK);
        for (DecodedIntent intent : batch) {
            if (mobCommandsThisTick >= MAX_MOB_COMMANDS
                    && worldCommandsThisTick >= MAX_WORLD_COMMANDS) {
                break; // both budgets exhausted
            }
            applyIntent(worldCtx, intent);
        }

        if (mobCommandsThisTick >= MAX_MOB_COMMANDS) {
            metrics.recordMobBudgetExhausted();
        }
        if (worldCommandsThisTick >= MAX_WORLD_COMMANDS) {
            metrics.recordWorldBudgetExhausted();
        }
    }

    private void applyIntent(CommandContext worldCtx, DecodedIntent intent) {
        ServerWorld world = worldCtx.world();

        // World intents (entity_id == 0)
        if (intent.entityId() == 0) {
            for (AiCommand cmd : intent.commands()) {
                if (worldCommandsThisTick >= MAX_WORLD_COMMANDS) break;
                worldApplier.apply(worldCtx, cmd);
                worldCommandsThisTick++;
                metrics.recordWorldCommandApplied();
            }
            return;
        }

        // ── Epoch-stale check at dequeue time ────────────────────────
        // Drop the entire intent if the entity is stale or dead BEFORE
        // iterating commands. This avoids wasting mob budget on intents
        // that would be no-ops.
        int entityId = intent.entityId();
        if (!creatureManager.isManaged(entityId)) {
            metrics.recordEpochStaleDrop();
            return;
        }
        if (intent.epoch() != creatureManager.getEpoch(entityId)) {
            metrics.recordEpochStaleDrop();
            return;
        }

        Entity entity = world.getEntityById(entityId);
        if (entity == null || !entity.isAlive()) {
            metrics.recordEntityDeadDrop();
            return;
        }
        if (!(entity instanceof MobEntity mob)) {
            metrics.recordEntityDeadDrop();
            return;
        }

        // ── Apply mob commands under budget ──────────────────────────
        CommandContext mobCtx = worldCtx.withMob(mob);
        for (AiCommand cmd : intent.commands()) {
            if (mobCommandsThisTick >= MAX_MOB_COMMANDS) break;
            mobApplier.apply(mobCtx, cmd);
            mobCommandsThisTick++;
            metrics.recordMobCommandApplied();
        }
    }
}
