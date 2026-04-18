package com.kbve.statetree.command;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

/**
 * Bounded intent queue for a single {@link IntentChannel}. Each channel
 * gets its own inbox with independent capacity and overflow tracking.
 *
 * <p>Instantiated twice by the orchestrator — one for entity intents,
 * one for world intents. The {@link IntentRouter} sorts decoded intents
 * into the correct inbox.
 */
public final class IntentInbox {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    private final IntentChannel channel;
    private final int capacity;
    private final Deque<DecodedIntent> queue = new ArrayDeque<>();
    private final BudgetMetrics metrics;

    public IntentInbox(IntentChannel channel, BudgetMetrics metrics) {
        this.channel = channel;
        this.capacity = channel.inboxCapacity();
        this.metrics = metrics;
    }

    public void enqueue(List<DecodedIntent> intents) {
        int added = 0;
        for (DecodedIntent intent : intents) {
            if (intent.commands().isEmpty()) continue;
            queue.addLast(intent);
            added++;
        }
        metrics.recordEnqueued(added);

        int evicted = 0;
        while (queue.size() > capacity) {
            queue.pollFirst();
            evicted++;
        }
        if (evicted > 0) {
            metrics.recordOverflowDrop(evicted);
        }
    }

    public List<DecodedIntent> drain(int limit) {
        int count = Math.min(limit, queue.size());
        if (count == 0) return List.of();

        List<DecodedIntent> batch = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            batch.add(queue.pollFirst());
        }
        return batch;
    }

    public IntentChannel channel() { return channel; }
    public int size() { return queue.size(); }
    public boolean isEmpty() { return queue.isEmpty(); }
}
