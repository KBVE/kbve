package com.kbve.statetree.ship;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * Pre-loads and caches ship schematics so they're ready for instant deployment.
 *
 * <p>The shipyard maintains:
 * <ul>
 *   <li><b>Blueprint cache</b> — parsed {@link ShipData} for each registered
 *       schematic, loaded once at server start. The 14MB Dark Reaper NBT is
 *       decompressed + parsed into 396k block entries once, then reused for
 *       every spawn call.</li>
 *   <li><b>Ready pool</b> — pre-built {@link ShipData} instances per ship type,
 *       capped at {@code maxReady}. When a player deploys a ship, the shipyard
 *       pops from the pool instantly instead of re-parsing the schematic.</li>
 * </ul>
 *
 * <p>Since {@link ShipData} is immutable (blocks map is unmodifiable), the same
 * instance can be shared across multiple deployments safely.
 *
 * <h3>Lifecycle</h3>
 * <ol>
 *   <li>{@link #registerBlueprint} — register a schematic name + JAR resource path</li>
 *   <li>{@link #loadAll} — parse all registered schematics (call once at server start)</li>
 *   <li>{@link #acquire} — pop a ready ship for deployment (instant, no I/O)</li>
 *   <li>The pool auto-refills from the cached blueprint (no re-parsing needed)</li>
 * </ol>
 */
public final class Shipyard {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    /** Default number of ready instances per ship type. */
    private static final int DEFAULT_MAX_READY = 3;

    /** Registered blueprints: name → JAR resource path. */
    private final ConcurrentHashMap<String, String> blueprintPaths = new ConcurrentHashMap<>();

    /** Parsed blueprint cache: name → ShipData (immutable, reusable). */
    private final ConcurrentHashMap<String, ShipData> blueprintCache = new ConcurrentHashMap<>();

    /** Ready pool: name → queue of pre-built ShipData instances. */
    private final ConcurrentHashMap<String, ConcurrentLinkedQueue<ShipData>> readyPool = new ConcurrentHashMap<>();

    /** Blueprints currently being loaded in a background thread. */
    private final ConcurrentHashMap<String, Boolean> loading = new ConcurrentHashMap<>();

    /** Max ready instances per ship type. */
    private final ConcurrentHashMap<String, Integer> maxReadyCounts = new ConcurrentHashMap<>();

    // -----------------------------------------------------------------------
    // Registration
    // -----------------------------------------------------------------------

    /**
     * Register a ship blueprint. Call before {@link #loadAll}.
     *
     * @param name     ship type name (e.g., "dark_reaper")
     * @param resource JAR resource path (e.g., "/schematics/dark_reaper.nbt")
     */
    public void registerBlueprint(String name, String resource) {
        registerBlueprint(name, resource, DEFAULT_MAX_READY);
    }

    /**
     * Register a ship blueprint with a custom pool size.
     */
    public void registerBlueprint(String name, String resource, int maxReady) {
        blueprintPaths.put(name, resource);
        maxReadyCounts.put(name, maxReady);
        readyPool.put(name, new ConcurrentLinkedQueue<>());
        LOGGER.info("[Shipyard] Registered blueprint '{}' (pool size: {})", name, maxReady);
    }

    // -----------------------------------------------------------------------
    // Loading
    // -----------------------------------------------------------------------

    /**
     * Parse all registered schematics and fill the ready pools.
     * Call once at server start. Logs load time per schematic.
     */
    public void loadAll() {
        LOGGER.info("[Shipyard] Loading {} blueprint(s)...", blueprintPaths.size());
        long totalStart = System.currentTimeMillis();

        for (Map.Entry<String, String> entry : blueprintPaths.entrySet()) {
            String name = entry.getKey();
            String resource = entry.getValue();

            long start = System.currentTimeMillis();
            ShipData data = SchematicLoader.loadFromResource(name, resource);
            long elapsed = System.currentTimeMillis() - start;

            if (data == null) {
                LOGGER.error("[Shipyard] Failed to load '{}' from {}", name, resource);
                continue;
            }

            blueprintCache.put(name, data);
            LOGGER.info("[Shipyard] Loaded '{}' in {}ms — {} blocks ({}x{}x{})",
                    name, elapsed, data.blockCount(), data.sizeX(), data.sizeY(), data.sizeZ());

            // Fill the ready pool — since ShipData is immutable, we just
            // reference the same instance multiple times.
            int maxReady = maxReadyCounts.getOrDefault(name, DEFAULT_MAX_READY);
            ConcurrentLinkedQueue<ShipData> pool = readyPool.get(name);
            for (int i = 0; i < maxReady; i++) {
                pool.offer(data);
            }
            LOGGER.info("[Shipyard] Pool for '{}': {}/{} ready", name, pool.size(), maxReady);
        }

        long totalElapsed = System.currentTimeMillis() - totalStart;
        LOGGER.info("[Shipyard] All blueprints loaded in {}ms", totalElapsed);
    }

    // -----------------------------------------------------------------------
    // Lazy loading
    // -----------------------------------------------------------------------

    /**
     * Trigger background loading of a blueprint if not already loaded or
     * in progress. Returns true if already ready, false if loading started.
     */
    public boolean ensureLoaded(String name) {
        if (blueprintCache.containsKey(name)) return true;
        if (!blueprintPaths.containsKey(name)) return false;
        if (loading.putIfAbsent(name, Boolean.TRUE) != null) return false; // already loading

        String resource = blueprintPaths.get(name);
        Thread loader = new Thread(() -> {
            LOGGER.info("[Shipyard] Background loading '{}'...", name);
            long start = System.currentTimeMillis();
            ShipData data = SchematicLoader.loadFromResource(name, resource);
            long elapsed = System.currentTimeMillis() - start;

            if (data != null) {
                blueprintCache.put(name, data);
                int maxReady = maxReadyCounts.getOrDefault(name, DEFAULT_MAX_READY);
                ConcurrentLinkedQueue<ShipData> pool = readyPool.get(name);
                if (pool != null) {
                    for (int i = 0; i < maxReady; i++) pool.offer(data);
                }
                LOGGER.info("[Shipyard] Loaded '{}' in {}ms — {} blocks",
                        name, elapsed, data.blockCount());
            } else {
                LOGGER.error("[Shipyard] Failed to load '{}'", name);
            }
            loading.remove(name);
        }, "shipyard-load-" + name);
        loader.setDaemon(true);
        loader.start();
        return false;
    }

    /** Check if a blueprint is currently being loaded. */
    public boolean isLoading(String name) {
        return loading.containsKey(name);
    }

    // -----------------------------------------------------------------------
    // Acquisition
    // -----------------------------------------------------------------------

    /**
     * Acquire a ship for deployment. Returns the cached {@link ShipData}
     * instantly if loaded. If not loaded yet, triggers background loading
     * and returns null.
     *
     * @param name ship type name
     * @return ShipData or null if not ready yet
     */
    public ShipData acquire(String name) {
        // Try the ready pool first
        ConcurrentLinkedQueue<ShipData> pool = readyPool.get(name);
        if (pool != null) {
            ShipData data = pool.poll();
            if (data != null) {
                pool.offer(data); // refill — immutable, same instance
                return data;
            }
        }

        // Fallback to blueprint cache
        ShipData cached = blueprintCache.get(name);
        if (cached != null) return cached;

        // Not loaded — trigger lazy load
        ensureLoaded(name);
        return null;
    }

    // -----------------------------------------------------------------------
    // Status
    // -----------------------------------------------------------------------

    /** Get the names of all registered blueprints. */
    public java.util.Set<String> blueprintNames() {
        return blueprintPaths.keySet();
    }

    /** Check if a blueprint is loaded and ready. */
    public boolean isReady(String name) {
        return blueprintCache.containsKey(name);
    }

    /** Get the number of ready instances for a ship type. */
    public int readyCount(String name) {
        ConcurrentLinkedQueue<ShipData> pool = readyPool.get(name);
        return pool != null ? pool.size() : 0;
    }

    /** Get the cached ShipData for status display (dimensions, block count). */
    public ShipData getBlueprint(String name) {
        return blueprintCache.get(name);
    }

    /** Total number of loaded blueprints. */
    public int loadedCount() {
        return blueprintCache.size();
    }
}
