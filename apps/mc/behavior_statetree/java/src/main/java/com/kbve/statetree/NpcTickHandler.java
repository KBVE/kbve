package com.kbve.statetree;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.entity.Entity;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Server tick handler — the sync boundary between Fabric and Tokio.
 *
 * <p>Each observation tick (every {@link #OBSERVE_INTERVAL} ticks) Java
 * pushes two things to Rust:
 * <ol>
 *   <li>A snapshot of all online players (positions, health) so the Rust
 *       ECS has the world state it needs for spawn/despawn policy.</li>
 *   <li>One per-creature observation per tracked mob (skeleton, pet dog, ...).</li>
 * </ol>
 *
 * <p>Every game tick Java polls and applies intents from Rust:
 * <ul>
 *   <li><b>Per-NPC intents</b> — {@code entity_id != 0}, target a specific
 *       tracked mob. Dispatched to {@link #applyMobCommand}.</li>
 *   <li><b>World intents</b> — {@code entity_id == 0}, not tied to any
 *       single mob (e.g. {@code SpawnSkeleton}, {@code SpawnPetDog},
 *       {@code Despawn}). Dispatched to {@link #applyWorldCommand}.</li>
 * </ul>
 *
 * <p>A single {@link AiCreatureManager} handles every creature archetype —
 * new creature types plug in via {@link CreatureKind} without touching
 * this class (aside from a new world-command branch).
 */
public class NpcTickHandler implements ServerTickEvents.EndTick {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");
    private static final Gson GSON = new Gson();

    /** Only submit observations every N ticks (10 = 0.5s at 20 TPS). */
    private static final int OBSERVE_INTERVAL = 10;

    private final AiCreatureManager creatureManager = new AiCreatureManager();
    private int tickCounter = 0;

    @Override
    public void onEndTick(MinecraftServer server) {
        if (!NativeRuntime.isLoaded()) {
            return;
        }

        tickCounter++;

        // Phase 0: Evict dead entities (every tick — cheap map sweep)
        creatureManager.tick(server);

        // Phase 1: Push observations — throttled to every OBSERVE_INTERVAL ticks
        if (tickCounter % OBSERVE_INTERVAL == 0) {
            submitPlayerSnapshot(server);
            creatureManager.submitObservations(server);
        }

        // Phase 2: Poll and apply intents every tick for responsiveness
        String intentsJson = NativeRuntime.pollIntents();
        if (intentsJson == null || intentsJson.equals("[]")) {
            return;
        }
        applyIntents(server, intentsJson);
    }

    // -----------------------------------------------------------------------
    // Player snapshot push — gives Rust the world model it needs for
    // spawn/despawn policy without asking Java per-decision
    // -----------------------------------------------------------------------

    private void submitPlayerSnapshot(MinecraftServer server) {
        ServerWorld overworld = server.getOverworld();
        if (overworld == null) return;

        long currentTick = overworld.getTime();

        JsonArray players = new JsonArray();
        for (ServerPlayerEntity player : overworld.getPlayers()) {
            JsonObject p = new JsonObject();
            p.addProperty("entity_id", player.getId());
            p.addProperty("username", player.getNameForScoreboard());

            JsonArray pos = new JsonArray();
            pos.add(player.getX());
            pos.add(player.getY());
            pos.add(player.getZ());
            p.add("position", pos);

            p.addProperty("health", player.getHealth());
            players.add(p);
        }

        JsonObject snapshot = new JsonObject();
        snapshot.add("players", players);
        snapshot.addProperty("tick", currentTick);

        NativeRuntime.submitPlayerSnapshot(GSON.toJson(snapshot));
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
            LOGGER.warn("[AI] Failed to parse intents JSON: {}", e.getMessage());
            return;
        }

        for (JsonElement elem : intents) {
            JsonObject intent = elem.getAsJsonObject();
            int entityId = intent.get("entity_id").getAsInt();
            long epoch = intent.get("epoch").getAsLong();

            JsonArray commands = intent.getAsJsonArray("commands");
            if (commands == null) continue;

            // World intents: entity_id == 0 means "not tied to a specific mob"
            if (entityId == 0) {
                for (JsonElement cmdElem : commands) {
                    applyWorldCommand(overworld, cmdElem.getAsJsonObject());
                }
                continue;
            }

            // Per-NPC intents: epoch-validated then dispatched per mob.
            if (!creatureManager.isManaged(entityId)) continue;
            if (epoch != creatureManager.getEpoch(entityId)) continue;

            Entity entity = overworld.getEntityById(entityId);
            if (entity == null || !entity.isAlive()) continue;
            if (!(entity instanceof MobEntity mob)) continue;

            for (JsonElement cmdElem : commands) {
                applyMobCommand(overworld, mob, cmdElem.getAsJsonObject());
            }
        }
    }

    // -----------------------------------------------------------------------
    // Per-NPC commands — operate on a specific mob
    // -----------------------------------------------------------------------

    private void applyMobCommand(ServerWorld world, MobEntity mob, JsonObject cmd) {
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
                            net.minecraft.text.Text.of("\u00A7c<AI> " + message),
                            false
                    );
                }
            }

        } else if (cmd.has("CallForHelp")) {
            // Rust already gated this through CallCooldown + GlobalCallCooldown.
            // The creature manager matches the reinforcement kind to the caller's.
            JsonObject call = cmd.getAsJsonObject("CallForHelp");
            int count = call.get("count").getAsInt();
            creatureManager.spawnReinforcements(world, mob.getId(), count);

        } else if (cmd.has("PoopPoison")) {
            // Rust already gated this via PoopCooldown — Java just applies
            // the status effect and plays the splat feedback.
            JsonObject poop = cmd.getAsJsonObject("PoopPoison");
            long targetId = poop.get("target_entity").getAsLong();
            int durationTicks = poop.get("duration_ticks").getAsInt();
            int amplifier = poop.get("amplifier").getAsInt();
            Entity target = world.getEntityById((int) targetId);
            if (target instanceof net.minecraft.entity.LivingEntity living && living.isAlive()) {
                living.addStatusEffect(new net.minecraft.entity.effect.StatusEffectInstance(
                        net.minecraft.entity.effect.StatusEffects.POISON,
                        durationTicks,
                        amplifier
                ));
                // Splat feedback: slime particles from the attacker's mouth
                // and a squish sound so watching players can see it land.
                world.spawnParticles(
                        net.minecraft.particle.ParticleTypes.ITEM_SLIME,
                        mob.getX(),
                        mob.getY() + mob.getStandingEyeHeight() * 0.5,
                        mob.getZ(),
                        8,
                        0.3, 0.2, 0.3,
                        0.02
                );
                world.playSound(
                        null,
                        mob.getBlockPos(),
                        net.minecraft.sound.SoundEvents.BLOCK_SLIME_BLOCK_BREAK,
                        net.minecraft.sound.SoundCategory.NEUTRAL,
                        1.0f,
                        1.6f
                );
                mob.lookAtEntity(target, 30.0f, 30.0f);
            }

        } else if (cmd.has("SetGoal")) {
            LOGGER.debug("[AI] SetGoal not yet implemented");
        }
    }

    // -----------------------------------------------------------------------
    // World commands — operate on world state, not a specific mob
    // -----------------------------------------------------------------------

    private void applyWorldCommand(ServerWorld world, JsonObject cmd) {
        if (cmd.has("SpawnSkeleton")) {
            JsonObject spawn = cmd.getAsJsonObject("SpawnSkeleton");
            int playerId = spawn.get("near_player").getAsInt();
            int radius = spawn.get("radius").getAsInt();
            creatureManager.spawnNearPlayer(world, CreatureKinds.SKELETON, playerId, radius, false);

        } else if (cmd.has("SpawnPetDog")) {
            JsonObject spawn = cmd.getAsJsonObject("SpawnPetDog");
            int playerId = spawn.get("near_player").getAsInt();
            int radius = spawn.get("radius").getAsInt();
            creatureManager.spawnNearPlayer(world, CreatureKinds.PET_DOG, playerId, radius, true);

        } else if (cmd.has("SpawnPetParrot")) {
            JsonObject spawn = cmd.getAsJsonObject("SpawnPetParrot");
            int playerId = spawn.get("near_player").getAsInt();
            int radius = spawn.get("radius").getAsInt();
            creatureManager.spawnNearPlayer(world, CreatureKinds.PET_PARROT, playerId, radius, true);

        } else if (cmd.has("Despawn")) {
            JsonObject despawn = cmd.getAsJsonObject("Despawn");
            int targetId = (int) despawn.get("target_entity").getAsLong();
            creatureManager.despawnEntity(world, targetId);
        }
    }
}
