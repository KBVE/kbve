package com.kbve.statetree.ship;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import net.minecraft.util.math.Vec3d;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Loads {@link FlightStats} entries from
 * {@code data/behavior_statetree/aircraft/*.json}. Reload-safe; called
 * by both server and client at world load.
 *
 * <p>Each JSON file may define any subset of the FlightStats fields;
 * unspecified fields fall back to {@link FlightStats#DEFAULT}.
 */
public final class FlightStatsRegistry {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");
    private static final Gson GSON = new Gson();
    private static final Map<String, FlightStats> STATS = new ConcurrentHashMap<>();
    /** Seat positions, keyed by model name. Outer list is indexed by passenger count - 1. */
    private static final Map<String, List<List<Vec3d>>> SEATS = new ConcurrentHashMap<>();
    /** Weapon mount offsets in ship-local space, keyed by model name. */
    private static final Map<String, List<Vec3d>> MOUNTS = new ConcurrentHashMap<>();

    private FlightStatsRegistry() {}

    /** Per-model seat positions. Inner list = positions for N passengers. */
    public static List<List<Vec3d>> getSeats(String modelName) {
        if (modelName == null) return Collections.emptyList();
        return SEATS.getOrDefault(modelName, Collections.emptyList());
    }

    /** Weapon mount positions (ship-local). Empty = single hardcoded forward mount. */
    public static List<Vec3d> getMounts(String modelName) {
        if (modelName == null) return Collections.emptyList();
        return MOUNTS.getOrDefault(modelName, Collections.emptyList());
    }

    /** Known aircraft profiles bundled in the mod jar. */
    private static final String[] BUILTIN_PROFILES = {
            "immersive_aircraft/airship",
            "immersive_aircraft/biplane",
            "immersive_aircraft/gyrodyne",
    };

    /**
     * Load all built-in profiles from the mod's classpath. Idempotent;
     * runs from both server-init and client-init so physics stays
     * consistent whether or not a server resource pack is present.
     */
    public static synchronized void loadBuiltins() {
        if (!STATS.isEmpty()) return;
        Map<String, FlightStats> nextStats = new HashMap<>();
        Map<String, List<List<Vec3d>>> nextSeats = new HashMap<>();
        Map<String, List<Vec3d>> nextMounts = new HashMap<>();
        for (String key : BUILTIN_PROFILES) {
            String path = "/data/behavior_statetree/aircraft/" + key + ".json";
            try (InputStream in = FlightStatsRegistry.class.getResourceAsStream(path)) {
                if (in == null) {
                    LOGGER.warn("[FlightStats] Missing profile resource {}", path);
                    continue;
                }
                JsonObject root = GSON.fromJson(new InputStreamReader(in), JsonObject.class);
                JsonObject props = root.has("properties") ? root.getAsJsonObject("properties") : root;
                nextStats.put(key, parse(props));
                if (root.has("passengerPositions")) {
                    nextSeats.put(key, parseSeats(root.getAsJsonArray("passengerPositions")));
                }
                if (root.has("weaponMounts")) {
                    nextMounts.put(key, parseFlatPositions(root.getAsJsonArray("weaponMounts")));
                }
            } catch (Exception ex) {
                LOGGER.warn("[FlightStats] Failed reading {}: {}", path, ex.toString());
            }
        }
        STATS.putAll(nextStats);
        SEATS.putAll(nextSeats);
        MOUNTS.putAll(nextMounts);
        LOGGER.info("[FlightStats] Loaded {} aircraft profiles: {}", STATS.size(), STATS.keySet());
    }

    private static List<Vec3d> parseFlatPositions(JsonArray arr) {
        List<Vec3d> result = new ArrayList<>(arr.size());
        for (JsonElement el : arr) {
            JsonObject o = el.getAsJsonObject();
            result.add(new Vec3d(
                    o.has("x") ? o.get("x").getAsDouble() : 0.0,
                    o.has("y") ? o.get("y").getAsDouble() : 0.0,
                    o.has("z") ? o.get("z").getAsDouble() : 0.0));
        }
        return result;
    }

    private static List<List<Vec3d>> parseSeats(JsonArray outer) {
        List<List<Vec3d>> result = new ArrayList<>(outer.size());
        for (JsonElement row : outer) {
            JsonArray seats = row.getAsJsonArray();
            List<Vec3d> rowSeats = new ArrayList<>(seats.size());
            for (JsonElement s : seats) {
                JsonObject o = s.getAsJsonObject();
                rowSeats.add(new Vec3d(
                        o.has("x") ? o.get("x").getAsDouble() : 0.0,
                        o.has("y") ? o.get("y").getAsDouble() : 0.0,
                        o.has("z") ? o.get("z").getAsDouble() : 0.0));
            }
            result.add(rowSeats);
        }
        return result;
    }

    /** Lookup by model name (e.g. "immersive_aircraft/airship"). */
    public static FlightStats get(String modelName) {
        if (modelName == null) return FlightStats.DEFAULT;
        FlightStats s = STATS.get(modelName);
        return s != null ? s : FlightStats.DEFAULT;
    }

    private static FlightStats parse(JsonObject p) {
        FlightStats d = FlightStats.DEFAULT;
        return new FlightStats(
                f(p, "yawSpeed", d.yawSpeed()),
                f(p, "pitchSpeed", d.pitchSpeed()),
                f(p, "engineSpeed", d.engineSpeed()),
                f(p, "verticalSpeed", d.verticalSpeed()),
                f(p, "glideFactor", d.glideFactor()),
                f(p, "lift", d.lift()),
                f(p, "horizontalDecay", d.horizontalDecay()),
                f(p, "verticalDecay", d.verticalDecay()),
                f(p, "rollFactor", d.rollFactor()),
                f(p, "stabilizer", d.stabilizer()),
                f(p, "wind", d.wind()),
                f(p, "mass", d.mass()),
                f(p, "groundFriction", d.groundFriction()),
                f(p, "groundPitch", d.groundPitch()),
                f(p, "engineReaction", d.engineReaction()),
                f(p, "verticalReaction", d.verticalReaction()),
                f(p, "boundingWidth", d.boundingWidth()),
                f(p, "boundingHeight", d.boundingHeight()),
                f(p, "cameraZoom", d.cameraZoom()),
                p.has("canExplodeOnCrash") && p.get("canExplodeOnCrash").getAsBoolean()
        );
    }

    private static float f(JsonObject p, String key, float def) {
        return p.has(key) ? p.get(key).getAsFloat() : def;
    }
}
