package com.kbve.statetree;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.entity.Entity;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.Vec3d;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Server tick handler — the sync boundary between Fabric and Tokio.
 *
 * <p>Each tick:
 * <ol>
 *   <li>Manage AI skeleton spawns/despawns via {@link AiSkeletonManager}</li>
 *   <li>Gather NPC observations and submit to Tokio runtime</li>
 *   <li>Poll completed intents and apply validated commands</li>
 * </ol>
 *
 * <p>The Fabric server tick thread is the ONLY thread that mutates entity state.
 * Tokio tasks produce immutable intents that are validated here before application.
 */
public class NpcTickHandler implements ServerTickEvents.EndTick {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");
    private static final Gson GSON = new Gson();

    private final AiSkeletonManager skeletonManager = new AiSkeletonManager();

    @Override
    public void onEndTick(MinecraftServer server) {
        if (!NativeRuntime.isLoaded()) {
            return;
        }

        // Phase 0: Manage skeleton lifecycle
        skeletonManager.tick(server);

        // Phase 1: Gather observations and submit to Tokio
        skeletonManager.submitObservations(server);

        // Phase 2: Poll completed intents from Tokio
        String intentsJson = NativeRuntime.pollIntents();
        if (intentsJson == null || intentsJson.equals("[]")) {
            return;
        }

        // Phase 3: Parse intents, validate epochs, apply commands
        applyIntents(server, intentsJson);
    }

    // -----------------------------------------------------------------------
    // Intent application
    // -----------------------------------------------------------------------

    private void applyIntents(MinecraftServer server, String intentsJson) {
        ServerWorld overworld = server.getOverworld();
        if (overworld == null) return;

        JsonArray intents;
        try {
            intents = GSON.fromJson(intentsJson, JsonArray.class);
        } catch (Exception e) {
            LOGGER.warn("[AI Skeleton] Failed to parse intents JSON: {}", e.getMessage());
            return;
        }

        for (JsonElement elem : intents) {
            JsonObject intent = elem.getAsJsonObject();
            int entityId = intent.get("entity_id").getAsInt();
            long epoch = intent.get("epoch").getAsLong();

            // Only apply to managed skeletons
            if (!skeletonManager.isManaged(entityId)) continue;

            // Epoch check — discard stale intents
            long currentEpoch = skeletonManager.getEpoch(entityId);
            if (epoch != currentEpoch) continue;

            Entity entity = overworld.getEntityById(entityId);
            if (entity == null || !entity.isAlive()) continue;
            if (!(entity instanceof MobEntity mob)) continue;

            JsonArray commands = intent.getAsJsonArray("commands");
            if (commands == null) continue;

            for (JsonElement cmdElem : commands) {
                JsonObject cmd = cmdElem.getAsJsonObject();
                applyCommand(overworld, mob, cmd);
            }
        }
    }

    private void applyCommand(ServerWorld world, MobEntity mob, JsonObject cmd) {
        // Commands are tagged unions — check which fields exist
        if (cmd.has("MoveTo")) {
            JsonObject moveTo = cmd.getAsJsonObject("MoveTo");
            JsonArray target = moveTo.getAsJsonArray("target");
            double tx = target.get(0).getAsDouble();
            double ty = target.get(1).getAsDouble();
            double tz = target.get(2).getAsDouble();

            // Use the mob's navigation to pathfind
            mob.getNavigation().startMovingTo(tx, ty, tz, 1.0);

        } else if (cmd.has("Attack")) {
            JsonObject attack = cmd.getAsJsonObject("Attack");
            long targetId = attack.get("target_entity").getAsLong();
            Entity target = world.getEntityById((int) targetId);
            if (target != null && target.isAlive()) {
                mob.tryAttack(world, target);
                // Face the target
                mob.lookAtEntity(target, 30.0f, 30.0f);
            }

        } else if (cmd.has("Idle")) {
            // Do nothing — skeleton stands still
            mob.getNavigation().stop();

        } else if (cmd.has("Speak")) {
            JsonObject speak = cmd.getAsJsonObject("Speak");
            String message = speak.get("message").getAsString();
            // Set custom name briefly to simulate speech
            mob.setCustomName(net.minecraft.text.Text.of("AI Skeleton: " + message));

        } else if (cmd.has("SetGoal")) {
            // Goal management — future expansion
            LOGGER.debug("[AI Skeleton] SetGoal not yet implemented");
        }
    }
}
