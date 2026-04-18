package com.kbve.statetree.command;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Tracks budget and queue health counters for the intent pipeline.
 * All counters are monotonic (only increment). Call {@link #reportIfDue}
 * periodically to log a summary when pressure is detected.
 *
 * <p>Designed to be queryable by Spark profiler or RCON commands in
 * the future. For now, periodic log output surfaces problems.
 */
public final class BudgetMetrics {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    /** Log a summary every N ticks when any pressure is detected. */
    private static final int REPORT_INTERVAL_TICKS = 600; // 30 seconds at 20 TPS

    // ── Inbox counters ───────────────────────────────────────────────
    private long inboxEnqueued = 0;
    private long inboxDroppedOverflow = 0;

    // ── Executor counters ────────────────────────────────────────────
    private long mobCommandsApplied = 0;
    private long worldCommandsApplied = 0;
    private long epochStaleDropped = 0;
    private long entityDeadDropped = 0;
    private long mobBudgetExhaustedTicks = 0;
    private long worldBudgetExhaustedTicks = 0;

    // ── Snapshot for delta reporting ─────────────────────────────────
    private long lastReportTick = 0;
    private long lastMobApplied = 0;
    private long lastWorldApplied = 0;
    private long lastStaleDropped = 0;
    private long lastDeadDropped = 0;
    private long lastOverflow = 0;

    // ── Inbox ────────────────────────────────────────────────────────

    public void recordEnqueued(int count) {
        inboxEnqueued += count;
    }

    public void recordOverflowDrop(int count) {
        inboxDroppedOverflow += count;
    }

    // ── Executor ─────────────────────────────────────────────────────

    public void recordMobCommandApplied() {
        mobCommandsApplied++;
    }

    public void recordWorldCommandApplied() {
        worldCommandsApplied++;
    }

    public void recordEpochStaleDrop() {
        epochStaleDropped++;
    }

    public void recordEntityDeadDrop() {
        entityDeadDropped++;
    }

    public void recordMobBudgetExhausted() {
        mobBudgetExhaustedTicks++;
    }

    public void recordWorldBudgetExhausted() {
        worldBudgetExhaustedTicks++;
    }

    // ── Accessors (for future Spark/RCON integration) ────────────────

    public long inboxEnqueued() { return inboxEnqueued; }
    public long inboxDroppedOverflow() { return inboxDroppedOverflow; }
    public long mobCommandsApplied() { return mobCommandsApplied; }
    public long worldCommandsApplied() { return worldCommandsApplied; }
    public long epochStaleDropped() { return epochStaleDropped; }
    public long entityDeadDropped() { return entityDeadDropped; }
    public long mobBudgetExhaustedTicks() { return mobBudgetExhaustedTicks; }
    public long worldBudgetExhaustedTicks() { return worldBudgetExhaustedTicks; }

    // ── Periodic reporting ───────────────────────────────────────────

    /**
     * If enough ticks have elapsed and any pressure was detected since
     * the last report, log a summary. Call once per server tick.
     */
    public void reportIfDue(long currentTick) {
        if (currentTick - lastReportTick < REPORT_INTERVAL_TICKS) return;

        long deltaMob = mobCommandsApplied - lastMobApplied;
        long deltaWorld = worldCommandsApplied - lastWorldApplied;
        long deltaStale = epochStaleDropped - lastStaleDropped;
        long deltaDead = entityDeadDropped - lastDeadDropped;
        long deltaOverflow = inboxDroppedOverflow - lastOverflow;

        boolean hasPressure = deltaStale > 0 || deltaDead > 0
                || deltaOverflow > 0
                || mobBudgetExhaustedTicks > 0
                || worldBudgetExhaustedTicks > 0;

        if (hasPressure) {
            LOGGER.info("[AI metrics] period={}t mob_applied={} world_applied={} "
                            + "epoch_stale={} entity_dead={} overflow={} "
                            + "mob_budget_exhausted={}t world_budget_exhausted={}t",
                    REPORT_INTERVAL_TICKS,
                    deltaMob, deltaWorld,
                    deltaStale, deltaDead, deltaOverflow,
                    mobBudgetExhaustedTicks, worldBudgetExhaustedTicks);
        }

        lastReportTick = currentTick;
        lastMobApplied = mobCommandsApplied;
        lastWorldApplied = worldCommandsApplied;
        lastStaleDropped = epochStaleDropped;
        lastDeadDropped = entityDeadDropped;
        lastOverflow = inboxDroppedOverflow;
        // Reset per-period exhaustion counters
        mobBudgetExhaustedTicks = 0;
        worldBudgetExhaustedTicks = 0;
    }
}
