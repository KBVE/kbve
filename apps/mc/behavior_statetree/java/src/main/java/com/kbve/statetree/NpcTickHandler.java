package com.kbve.statetree;

import com.kbve.statetree.command.*;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.world.ServerWorld;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

/**
 * Server tick handler — the sync boundary between Fabric and Tokio.
 *
 * <p>This class is deliberately boring. It orchestrates four concerns
 * on a schedule and delegates all real work:
 * <ol>
 *   <li><b>Lifecycle</b> — evict dead entities, clean scaffolding.</li>
 *   <li><b>Observations</b> — publish player/creature snapshots to Rust
 *       on a throttled cadence.</li>
 *   <li><b>Ingest</b> — poll Rust for intents, decode JSON into typed
 *       DTOs, enqueue into the bounded inbox.</li>
 *   <li><b>Execute</b> — drain a budgeted batch of commands from the
 *       inbox and apply them through typed registries.</li>
 * </ol>
 *
 * <p>Game logic (particles, projectiles, spawning, ship ops) lives in
 * {@link MobCommandApplier} and {@link WorldCommandApplier}. JSON
 * decoding lives in {@link IntentDecoder}. Budget enforcement lives
 * in {@link IntentExecutor}. This class touches none of that.
 */
public class NpcTickHandler implements ServerTickEvents.EndTick {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    /** Only submit observations every N ticks (10 = 0.5s at 20 TPS). */
    private static final int OBSERVE_INTERVAL = 10;

    /** Only scan map data every N ticks (60 = 3s at 20 TPS). */
    private static final int MAP_SCAN_INTERVAL = 60;

    // ── Owned components ─────────────────────────────────────────────
    private final AiCreatureManager creatureManager = new AiCreatureManager();
    private final ScaffoldTracker scaffoldTracker = new ScaffoldTracker();
    private final ObservationPublisher observationPublisher;
    private final BudgetMetrics metrics = new BudgetMetrics();
    private final IntentInbox inbox = new IntentInbox(metrics);
    private final MobCommandApplier mobApplier = new MobCommandApplier();
    private final WorldCommandApplier worldApplier = new WorldCommandApplier();
    private final IntentExecutor executor;

    private com.kbve.statetree.ship.ShipManager shipManager;
    private int tickCounter = 0;

    public NpcTickHandler() {
        this.observationPublisher = new ObservationPublisher(creatureManager);
        this.executor = new IntentExecutor(inbox, mobApplier, worldApplier, creatureManager, metrics);
    }

    /** Inject the ship manager (called once during mod init). */
    public void setShipManager(com.kbve.statetree.ship.ShipManager manager) {
        this.shipManager = manager;
    }

    @Override
    public void onEndTick(MinecraftServer server) {
        if (!NativeRuntime.isLoaded()) return;

        tickCounter++;

        // 1. Lifecycle — evict dead entities, clean expired scaffolding
        creatureManager.tick(server);
        ServerWorld overworld = server.getOverworld();
        if (overworld != null) {
            scaffoldTracker.tick(overworld, overworld.getTime());
        }

        // 2. Observations — throttled publish to Rust
        if (tickCounter % OBSERVE_INTERVAL == 0) {
            observationPublisher.publishObservations(server);
        }
        if (tickCounter % MAP_SCAN_INTERVAL == 0) {
            observationPublisher.publishMapScan(server);
        }

        // 3. Ingest — poll, decode, enqueue
        String payload = NativeRuntime.pollIntents();
        if (payload != null && !payload.equals("[]")) {
            List<DecodedIntent> intents = IntentDecoder.decode(payload);
            inbox.enqueue(intents);
        }

        // 4. Execute — budgeted drain from inbox
        if (!inbox.isEmpty() && overworld != null) {
            CommandContext ctx = CommandContext.forWorld(
                    overworld, creatureManager, scaffoldTracker, shipManager);
            executor.applyBudgeted(ctx);
        }

        // 5. Metrics — periodic log when pressure detected
        if (overworld != null) {
            metrics.reportIfDue(overworld.getTime());
        }
    }
}
