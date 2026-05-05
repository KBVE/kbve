package com.kbve.statetree.command;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Decodes raw JSON from {@code NativeRuntime.pollIntents()} into typed
 * {@link DecodedIntent} records. This is the <b>only</b> place in the
 * codebase that touches the wire format — everything downstream works
 * with typed {@link AiCommand} instances.
 *
 * <p>Legacy per-creature spawn commands ({@code SpawnSkeleton},
 * {@code SpawnPetDog}, etc.) are normalized into the generic
 * {@link AiCommand.SpawnCreature} during decode so appliers only need
 * to handle one spawn path.
 */
public final class IntentDecoder {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");
    private static final Gson GSON = new Gson();

    /** Legacy wire key → (creatureTag, tamed). */
    private static final Map<String, LegacySpawn> LEGACY_SPAWNS = Map.of(
            "SpawnSkeleton", new LegacySpawn("skeleton", false),
            "SpawnPetDog", new LegacySpawn("dog", true),
            "SpawnPetParrot", new LegacySpawn("parrot", true),
            "SpawnSkeletonMelee", new LegacySpawn("skeleton_melee", false),
            "SpawnSkeletonMage", new LegacySpawn("skeleton_mage", false),
            "SpawnSkeletonArcher", new LegacySpawn("skeleton_archer", false)
    );

    private record LegacySpawn(String creatureTag, boolean tamed) {}

    private IntentDecoder() {}

    /**
     * Decode the raw JSON payload into a list of typed intents.
     * Returns an empty list on parse failure (never null).
     */
    public static List<DecodedIntent> decode(String json) {
        if (json == null || json.equals("[]")) return Collections.emptyList();

        JsonArray intents;
        try {
            intents = GSON.fromJson(json, JsonArray.class);
        } catch (Exception e) {
            LOGGER.warn("[AI] Failed to parse intents JSON: {}", e.getMessage());
            return Collections.emptyList();
        }

        List<DecodedIntent> result = new ArrayList<>(intents.size());
        for (JsonElement elem : intents) {
            try {
                result.add(decodeIntent(elem.getAsJsonObject()));
            } catch (Exception e) {
                LOGGER.warn("[AI] Skipping malformed intent: {}", e.getMessage());
            }
        }
        return result;
    }

    private static DecodedIntent decodeIntent(JsonObject intent) {
        int entityId = intent.get("entity_id").getAsInt();
        long epoch = intent.get("epoch").getAsLong();

        JsonArray rawCommands = intent.getAsJsonArray("commands");
        if (rawCommands == null || rawCommands.isEmpty()) {
            return new DecodedIntent(entityId, epoch, Collections.emptyList());
        }

        List<AiCommand> commands = new ArrayList<>(rawCommands.size());
        for (JsonElement cmdElem : rawCommands) {
            AiCommand cmd = decodeCommand(cmdElem.getAsJsonObject());
            if (cmd != null) commands.add(cmd);
        }
        return new DecodedIntent(entityId, epoch, commands);
    }

    private static AiCommand decodeCommand(JsonObject raw) {
        // Try each key in the JSON object to find the command kind.
        // The wire format is { "CommandName": { ...payload } }.
        for (String key : raw.keySet()) {
            // Check legacy spawn commands first — normalize to SpawnCreature
            LegacySpawn legacy = LEGACY_SPAWNS.get(key);
            if (legacy != null) {
                return decodeLegacySpawn(raw.getAsJsonObject(key), legacy);
            }

            CommandKind kind = CommandKind.fromWireKey(key);
            if (kind == null) {
                LOGGER.debug("[AI] Unknown command key '{}', skipping", key);
                return null;
            }

            JsonObject payload = raw.getAsJsonObject(key);
            return switch (kind) {
                // Mob commands
                case MOVE_TO -> decodeMoveToCommand(payload);
                case ATTACK -> new AiCommand.Attack(payload.get("target_entity").getAsInt());
                case IDLE -> new AiCommand.Idle();
                case SPEAK -> new AiCommand.Speak(payload.get("message").getAsString());
                case CALL_FOR_HELP -> new AiCommand.CallForHelp(payload.get("count").getAsInt());
                case POOP_POISON -> decodePoopPoison(payload);
                case PLACE_BLOCK -> decodePlaceBlock(payload);
                case TELEPORT -> decodeTeleport(payload);
                case SHOOT_ARROW -> decodeShootArrow(payload);
                case SET_GOAL -> new AiCommand.SetGoal(
                        payload.has("goal") ? payload.get("goal").getAsString() : "");

                // World commands
                case SPAWN_CREATURE -> decodeSpawnCreature(payload);
                case SPAWN_CREATURE_PACK -> decodeSpawnCreaturePack(payload);
                case DESPAWN -> new AiCommand.Despawn(payload.get("target_entity").getAsInt());
                case MOVE_SHIP -> new AiCommand.MoveShip(
                        payload.get("ship_id").getAsString(),
                        payload.get("distance").getAsInt());
                case DESPAWN_SHIP -> new AiCommand.DespawnShip(
                        payload.get("ship_id").getAsString());
                case SPAWN_SHIP -> new AiCommand.SpawnShip(
                        payload.get("ship_name").getAsString(),
                        payload.get("near_player").getAsInt());

                // Legacy spawns handled above; these enum variants exist for
                // backward compat but should never reach here.
                case SPAWN_SKELETON_HORSEMEN_PACK -> decodeLegacyHorsemenPack(payload);
                default -> null;
            };
        }
        return null;
    }

    // ------------------------------------------------------------------
    // Mob command decoders
    // ------------------------------------------------------------------

    private static AiCommand.MoveTo decodeMoveToCommand(JsonObject payload) {
        JsonArray target = payload.getAsJsonArray("target");
        double speed = payload.has("speed") ? payload.get("speed").getAsDouble() : 1.0;
        return new AiCommand.MoveTo(
                target.get(0).getAsDouble(),
                target.get(1).getAsDouble(),
                target.get(2).getAsDouble(),
                speed);
    }

    private static AiCommand.PoopPoison decodePoopPoison(JsonObject payload) {
        return new AiCommand.PoopPoison(
                payload.get("target_entity").getAsInt(),
                payload.get("duration_ticks").getAsInt(),
                payload.get("amplifier").getAsInt());
    }

    private static AiCommand.PlaceBlock decodePlaceBlock(JsonObject payload) {
        JsonArray pos = payload.getAsJsonArray("block_pos");
        return new AiCommand.PlaceBlock(
                pos.get(0).getAsInt(),
                pos.get(1).getAsInt(),
                pos.get(2).getAsInt(),
                payload.get("block_type").getAsString(),
                payload.has("cleanup_ticks") ? payload.get("cleanup_ticks").getAsInt() : 0);
    }

    private static AiCommand.Teleport decodeTeleport(JsonObject payload) {
        JsonArray target = payload.getAsJsonArray("target");
        return new AiCommand.Teleport(
                target.get(0).getAsDouble(),
                target.get(1).getAsDouble(),
                target.get(2).getAsDouble());
    }

    private static AiCommand.ShootArrow decodeShootArrow(JsonObject payload) {
        return new AiCommand.ShootArrow(
                payload.get("target_entity").getAsInt(),
                payload.has("power") ? payload.get("power").getAsFloat() : 0.8f);
    }

    // ------------------------------------------------------------------
    // World command decoders
    // ------------------------------------------------------------------

    private static AiCommand.SpawnCreature decodeSpawnCreature(JsonObject payload) {
        return new AiCommand.SpawnCreature(
                payload.get("creature_tag").getAsString(),
                payload.get("near_player").getAsInt(),
                payload.get("radius").getAsInt(),
                payload.has("tamed") && payload.get("tamed").getAsBoolean(),
                payload.has("count") ? payload.get("count").getAsInt() : 1);
    }

    private static AiCommand.SpawnCreaturePack decodeSpawnCreaturePack(JsonObject payload) {
        int nearPlayer = payload.get("near_player").getAsInt();
        int radius = payload.get("radius").getAsInt();
        JsonArray rawEntries = payload.getAsJsonArray("entries");
        List<AiCommand.SpawnCreaturePack.PackEntry> entries = new ArrayList<>();
        for (JsonElement e : rawEntries) {
            JsonObject entry = e.getAsJsonObject();
            entries.add(new AiCommand.SpawnCreaturePack.PackEntry(
                    entry.get("creature_tag").getAsString(),
                    entry.has("count") ? entry.get("count").getAsInt() : 1,
                    entry.has("tamed") && entry.get("tamed").getAsBoolean()));
        }
        return new AiCommand.SpawnCreaturePack(nearPlayer, radius, entries);
    }

    // ------------------------------------------------------------------
    // Legacy normalizers — convert old per-creature commands into generic
    // ------------------------------------------------------------------

    private static AiCommand.SpawnCreature decodeLegacySpawn(JsonObject payload, LegacySpawn legacy) {
        return new AiCommand.SpawnCreature(
                legacy.creatureTag(),
                payload.get("near_player").getAsInt(),
                payload.get("radius").getAsInt(),
                legacy.tamed(),
                1);
    }

    private static AiCommand.SpawnCreaturePack decodeLegacyHorsemenPack(JsonObject payload) {
        int nearPlayer = payload.get("near_player").getAsInt();
        int radius = payload.get("radius").getAsInt();
        int horsemen = payload.has("horsemen") ? payload.get("horsemen").getAsInt() : 2;
        int archers = payload.has("archers") ? payload.get("archers").getAsInt() : 3;
        return new AiCommand.SpawnCreaturePack(nearPlayer, radius, List.of(
                new AiCommand.SpawnCreaturePack.PackEntry("skeleton_horseman", horsemen, false),
                new AiCommand.SpawnCreaturePack.PackEntry("skeleton_archer", archers, false)));
    }
}
