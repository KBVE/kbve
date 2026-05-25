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
 * <p>This class is deliberately boring. It orchestrates five concerns
 * on a schedule and delegates all real work:
 * <ol>
 *   <li><b>Lifecycle</b> — evict dead entities, clean scaffolding.</li>
 *   <li><b>Observations</b> — publish player/creature snapshots to Rust
 *       on a throttled cadence.</li>
 *   <li><b>Ingest</b> — poll Rust for intents, decode JSON into typed
 *       DTOs, route into dual-channel inboxes.</li>
 *   <li><b>Execute</b> — drain entity channel every tick, drain world
 *       channel every {@link #WORLD_DRAIN_INTERVAL} ticks.</li>
 *   <li><b>Metrics</b> — periodic log when pressure detected.</li>
 * </ol>
 *
 * <p>The authority split ensures cheap entity intents (movement, combat)
 * never compete with expensive world mutations (spawns, ship ops) for
 * queue space or budget.
 */
public class NpcTickHandler implements ServerTickEvents.EndTick {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    /** Only submit observations every N ticks (10 = 0.5s at 20 TPS). */
    private static final int OBSERVE_INTERVAL = 10;

    /** Only scan map data every N ticks (60 = 3s at 20 TPS). */
    private static final int MAP_SCAN_INTERVAL = 60;

    /**
     * World channel drain cadence. Every N ticks, world intents are
     * applied. Spreads expensive mutations (spawns, ship ops) across
     * ticks so they don't cluster into a single spike.
     */
    private static final int WORLD_DRAIN_INTERVAL = 2;

    // ── Owned components ─────────────────────────────────────────────
    private final AiCreatureManager creatureManager = new AiCreatureManager();
    private final ScaffoldTracker scaffoldTracker = new ScaffoldTracker();
    private final ObservationPublisher observationPublisher;
    private final BudgetMetrics metrics = new BudgetMetrics();
    private final IntentInbox entityInbox = new IntentInbox(IntentChannel.ENTITY, metrics);
    private final IntentInbox worldInbox = new IntentInbox(IntentChannel.WORLD, metrics);
    private final IntentRouter router = new IntentRouter(entityInbox, worldInbox);
    private final MobCommandApplier mobApplier = new MobCommandApplier();
    private final WorldCommandApplier worldApplier = new WorldCommandApplier();
    private final IntentExecutor executor;

    private com.kbve.statetree.ship.ShipManager shipManager;
    private int tickCounter = 0;

    public NpcTickHandler() {
        this.observationPublisher = new ObservationPublisher(creatureManager);
        this.executor = new IntentExecutor(
                entityInbox, worldInbox,
                mobApplier, worldApplier,
                creatureManager, metrics);
    }

    public AiCreatureManager getCreatureManager() {
        return creatureManager;
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

        // 3. Ingest — poll, decode, route into dual-channel inboxes
        String payload = NativeRuntime.pollIntents();
        if (payload != null && !payload.equals("[]")) {
            List<DecodedIntent> intents = IntentDecoder.decode(payload);
            router.route(intents);
        }

        // 4a. Entity channel — drain every tick (cheap, high-frequency)
        if (!entityInbox.isEmpty() && overworld != null) {
            CommandContext ctx = CommandContext.forWorld(
                    overworld, creatureManager, scaffoldTracker, shipManager);
            executor.applyEntityChannel(ctx);
        }

        // 4b. World channel — drain on throttled cadence (expensive mutations)
        if (tickCounter % WORLD_DRAIN_INTERVAL == 0
                && !worldInbox.isEmpty() && overworld != null) {
            CommandContext ctx = CommandContext.forWorld(
                    overworld, creatureManager, scaffoldTracker, shipManager);
            executor.applyWorldChannel(ctx);
        }

        // 5. Metrics — periodic log when pressure detected
        if (overworld != null) {
            metrics.reportIfDue(overworld.getTime());
        }
    }
}
