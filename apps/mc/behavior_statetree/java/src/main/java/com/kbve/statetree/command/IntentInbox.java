package com.kbve.statetree.command;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;

/**
 * Bounded queue between {@code NativeRuntime.pollIntents()} and command
 * application. Decoded intents are enqueued here; the executor drains a
 * budgeted amount per tick.
 *
 * <p>Provides backpressure: if the queue exceeds {@link #MAX_QUEUED_INTENTS},
 * the oldest intents are dropped (they're likely stale anyway). This is
 * the thin-B safety valve — prevents one burst from Rust blowing TPS.
 */
public final class IntentInbox {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    /** Max intents buffered across ticks. Beyond this, oldest are dropped. */
    private static final int MAX_QUEUED_INTENTS = 512;

    private final Deque<DecodedIntent> queue = new ArrayDeque<>();
    private long droppedTotal = 0;

    /**
     * Enqueue decoded intents. If the queue would exceed the cap, the
     * oldest entries are evicted first.
     */
    public void enqueue(List<DecodedIntent> intents) {
        for (DecodedIntent intent : intents) {
            if (intent.commands().isEmpty()) continue;
            queue.addLast(intent);
        }
        // Evict oldest if over capacity
        while (queue.size() > MAX_QUEUED_INTENTS) {
            queue.pollFirst();
            droppedTotal++;
        }
        if (droppedTotal > 0 && droppedTotal % 100 == 0) {
            LOGGER.warn("[AI] Intent inbox overflow — {} intents dropped total", droppedTotal);
        }
    }

    /** Poll up to {@code limit} intents from the front of the queue. */
    public List<DecodedIntent> drain(int limit) {
        int count = Math.min(limit, queue.size());
        if (count == 0) return List.of();

        List<DecodedIntent> batch = new java.util.ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            batch.add(queue.pollFirst());
        }
        return batch;
    }

    public int size() {
        return queue.size();
    }

    public boolean isEmpty() {
        return queue.isEmpty();
    }

    public long droppedTotal() {
        return droppedTotal;
    }
}
