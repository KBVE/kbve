package com.kbve.statetree.command;

import java.util.ArrayList;
import java.util.List;

/**
 * Routes decoded intents into the correct {@link IntentChannel} inbox.
 *
 * <p>Routing rule is simple: {@code entityId == 0} → WORLD channel,
 * everything else → ENTITY channel. This is the authority boundary —
 * entity intents and world mutations flow through independent queues
 * with separate capacities and drain cadences.
 */
public final class IntentRouter {

    private final IntentInbox entityInbox;
    private final IntentInbox worldInbox;

    public IntentRouter(IntentInbox entityInbox, IntentInbox worldInbox) {
        this.entityInbox = entityInbox;
        this.worldInbox = worldInbox;
    }

    /**
     * Sort a batch of decoded intents into the correct channel inbox.
     */
    public void route(List<DecodedIntent> intents) {
        List<DecodedIntent> entityBatch = null;
        List<DecodedIntent> worldBatch = null;

        for (DecodedIntent intent : intents) {
            if (intent.entityId() == 0) {
                if (worldBatch == null) worldBatch = new ArrayList<>();
                worldBatch.add(intent);
            } else {
                if (entityBatch == null) entityBatch = new ArrayList<>();
                entityBatch.add(intent);
            }
        }

        if (entityBatch != null) entityInbox.enqueue(entityBatch);
        if (worldBatch != null) worldInbox.enqueue(worldBatch);
    }

    public IntentInbox entityInbox() { return entityInbox; }
    public IntentInbox worldInbox() { return worldInbox; }
}
