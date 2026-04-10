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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Server tick handler — the sync boundary between Fabric and Tokio.
 *
 * <p>Observations are throttled to every {@link #OBSERVE_INTERVAL} ticks
 * to avoid overwhelming the Tokio runtime. Intents are polled every tick
 * so actions feel responsive once decided.
 */
public class NpcTickHandler implements ServerTickEvents.EndTick {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");
    private static final Gson GSON = new Gson();

    /** Only submit observations every N ticks (10 = 0.5s at 20 TPS). */
    private static final int OBSERVE_INTERVAL = 10;

    private final AiSkeletonManager skeletonManager = new AiSkeletonManager();
    private int tickCounter = 0;

    @Override
    public void onEndTick(MinecraftServer server) {
        if (!NativeRuntime.isLoaded()) {
            return;
        }

        tickCounter++;

        // Phase 0: Manage skeleton lifecycle (every tick for cleanup)
        skeletonManager.tick(server);

        // Phase 1: Gather observations — throttled to reduce load
        if (tickCounter % OBSERVE_INTERVAL == 0) {
            skeletonManager.submitObservations(server);
        }

        // Phase 2 + 3: Poll and apply intents every tick for responsiveness
        String intentsJson = NativeRuntime.pollIntents();
        if (intentsJson == null || intentsJson.equals("[]")) {
            return;
        }
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

            if (!skeletonManager.isManaged(entityId)) continue;

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
        if (cmd.has("MoveTo")) {
            JsonObject moveTo = cmd.getAsJsonObject("MoveTo");
            JsonArray target = moveTo.getAsJsonArray("target");
            double tx = target.get(0).getAsDouble();
            double ty = target.get(1).getAsDouble();
            double tz = target.get(2).getAsDouble();
            mob.getNavigation().startMovingTo(tx, ty, tz, 1.0);

        } else if (cmd.has("Attack")) {
            JsonObject attack = cmd.getAsJsonObject("Attack");
            long targetId = attack.get("target_entity").getAsLong();
            Entity target = world.getEntityById((int) targetId);
            if (target != null && target.isAlive()) {
                mob.tryAttack(world, target);
                mob.lookAtEntity(target, 30.0f, 30.0f);
            }

        } else if (cmd.has("Idle")) {
            mob.getNavigation().stop();

        } else if (cmd.has("Speak")) {
            JsonObject speak = cmd.getAsJsonObject("Speak");
            String message = speak.get("message").getAsString();
            for (var player : world.getPlayers()) {
                if (mob.squaredDistanceTo(player) < 32 * 32) {
                    player.sendMessage(
                            net.minecraft.text.Text.of("\u00A7c<AI Skeleton> " + message),
                            false
                    );
                }
            }

        } else if (cmd.has("CallForHelp")) {
            // Pure actuator: Rust already gated this through CallCooldown +
            // GlobalCallCooldown. Java just spawns whatever was asked.
            JsonObject call = cmd.getAsJsonObject("CallForHelp");
            int count = call.get("count").getAsInt();
            skeletonManager.spawnReinforcements(world, mob.getId(), count);

        } else if (cmd.has("SetGoal")) {
            LOGGER.debug("[AI Skeleton] SetGoal not yet implemented");
        }
    }
}
