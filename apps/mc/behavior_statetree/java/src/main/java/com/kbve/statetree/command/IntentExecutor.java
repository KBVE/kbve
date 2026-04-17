package com.kbve.statetree.command;

import com.kbve.statetree.AiCreatureManager;
import net.minecraft.entity.Entity;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.server.world.ServerWorld;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

/**
 * Budgeted command executor. Each tick, drains a bounded number of intents
 * from the {@link IntentInbox} and applies them through the typed applier
 * registries. Stale commands (epoch mismatch, dead entity) are dropped on
 * dequeue, not wasted on execution.
 *
 * <p>Per-tick budget caps:
 * <ul>
 *   <li>{@link #MAX_INTENTS_PER_TICK} — max intent envelopes processed</li>
 *   <li>{@link #MAX_COMMANDS_PER_TICK} — max individual commands applied</li>
 * </ul>
 * Anything beyond rolls to the next tick.
 */
public final class IntentExecutor {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    /** Max intent envelopes (each may contain multiple commands) per tick. */
    private static final int MAX_INTENTS_PER_TICK = 64;

    /** Max individual commands applied per tick across all intents. */
    private static final int MAX_COMMANDS_PER_TICK = 128;

    private final IntentInbox inbox;
    private final MobCommandApplier mobApplier;
    private final WorldCommandApplier worldApplier;
    private final AiCreatureManager creatureManager;

    private int commandsThisTick;

    public IntentExecutor(IntentInbox inbox,
                          MobCommandApplier mobApplier,
                          WorldCommandApplier worldApplier,
                          AiCreatureManager creatureManager) {
        this.inbox = inbox;
        this.mobApplier = mobApplier;
        this.worldApplier = worldApplier;
        this.creatureManager = creatureManager;
    }

    /**
     * Drain and apply a budgeted batch of commands for this tick.
     * Call once per server tick from the orchestrator.
     */
    public void applyBudgeted(CommandContext worldCtx) {
        commandsThisTick = 0;

        List<DecodedIntent> batch = inbox.drain(MAX_INTENTS_PER_TICK);
        for (DecodedIntent intent : batch) {
            if (commandsThisTick >= MAX_COMMANDS_PER_TICK) break;
            applyIntent(worldCtx, intent);
        }
    }

    private void applyIntent(CommandContext worldCtx, DecodedIntent intent) {
        ServerWorld world = worldCtx.world();

        // World intents (entity_id == 0)
        if (intent.entityId() == 0) {
            for (AiCommand cmd : intent.commands()) {
                if (commandsThisTick >= MAX_COMMANDS_PER_TICK) break;
                worldApplier.apply(worldCtx, cmd);
                commandsThisTick++;
            }
            return;
        }

        // Mob intents — validate epoch + entity before applying
        int entityId = intent.entityId();
        if (!creatureManager.isManaged(entityId)) return;
        if (intent.epoch() != creatureManager.getEpoch(entityId)) return;

        Entity entity = world.getEntityById(entityId);
        if (entity == null || !entity.isAlive()) return;
        if (!(entity instanceof MobEntity mob)) return;

        CommandContext mobCtx = worldCtx.withMob(mob);
        for (AiCommand cmd : intent.commands()) {
            if (commandsThisTick >= MAX_COMMANDS_PER_TICK) break;
            mobApplier.apply(mobCtx, cmd);
            commandsThisTick++;
        }
    }
}
