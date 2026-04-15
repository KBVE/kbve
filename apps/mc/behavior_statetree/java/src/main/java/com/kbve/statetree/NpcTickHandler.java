package com.kbve.statetree;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.block.Blocks;
import net.minecraft.entity.Entity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.entity.projectile.ArrowEntity;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
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

    /** Only scan map data every N ticks (60 = 3s at 20 TPS). */
    private static final int MAP_SCAN_INTERVAL = 60;

    private final AiCreatureManager creatureManager = new AiCreatureManager();
    private final ScaffoldTracker scaffoldTracker = new ScaffoldTracker();
    private com.kbve.statetree.ship.ShipManager shipManager;
    private int tickCounter = 0;

    /** Inject the ship manager so world commands can dispatch ship ops. */
    public void setShipManager(com.kbve.statetree.ship.ShipManager manager) {
        this.shipManager = manager;
    }

    @Override
    public void onEndTick(MinecraftServer server) {
        if (!NativeRuntime.isLoaded()) {
            return;
        }

        tickCounter++;

        // Phase 0: Evict dead entities + clean up expired scaffolding
        creatureManager.tick(server);
        ServerWorld overworld0 = server.getOverworld();
        if (overworld0 != null) {
            scaffoldTracker.tick(overworld0, overworld0.getTime());
        }

        // Phase 1: Push observations — throttled to every OBSERVE_INTERVAL ticks
        if (tickCounter % OBSERVE_INTERVAL == 0) {
            submitPlayerSnapshot(server);
            creatureManager.submitObservations(server);
        }

        // Phase 1b: Scan map surface — slower cadence than observations.
        // Builds a 64x64 walkability grid centered on the player centroid
        // and pushes it to Rust for flow field + chokepoint computation.
        if (tickCounter % MAP_SCAN_INTERVAL == 0) {
            ServerWorld overworld = server.getOverworld();
            if (overworld != null) {
                MapScanner.scanAndSubmit(overworld, overworld.getTime());
            }
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
            // Rust picks the speed multiplier per intent (1.0 = walk,
            // 1.3-1.5 reads as a sprint). Defaults to 1.0 for legacy
            // JSON written before the speed field was added.
            double speed = moveTo.has("speed") ? moveTo.get("speed").getAsDouble() : 1.0;
            mob.getNavigation().startMovingTo(tx, ty, tz, speed);

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

        } else if (cmd.has("PlaceBlock")) {
            JsonObject place = cmd.getAsJsonObject("PlaceBlock");
            JsonArray blockPos = place.getAsJsonArray("block_pos");
            int bx = blockPos.get(0).getAsInt();
            int by = blockPos.get(1).getAsInt();
            int bz = blockPos.get(2).getAsInt();
            String blockType = place.get("block_type").getAsString();
            int cleanupTicks = place.has("cleanup_ticks") ? place.get("cleanup_ticks").getAsInt() : 0;

            BlockPos pos = new BlockPos(bx, by, bz);
            // Only place if the target position is air (don't overwrite existing blocks)
            if (world.getBlockState(pos).isAir()) {
                if ("scaffolding".equals(blockType)) {
                    world.setBlockState(pos, Blocks.SCAFFOLDING.getDefaultState());
                }
                // Track for auto-cleanup
                if (cleanupTicks > 0) {
                    scaffoldTracker.track(pos, world.getTime(), cleanupTicks);
                }
            }

        } else if (cmd.has("Teleport")) {
            JsonObject teleport = cmd.getAsJsonObject("Teleport");
            JsonArray target = teleport.getAsJsonArray("target");
            double tx = target.get(0).getAsDouble();
            double ty = target.get(1).getAsDouble();
            double tz = target.get(2).getAsDouble();

            // Enderman-style teleport: particles at origin, move, particles at destination
            world.spawnParticles(
                    ParticleTypes.PORTAL, mob.getX(), mob.getY() + 1.0, mob.getZ(),
                    32, 0.5, 1.0, 0.5, 0.1
            );
            world.playSound(null, mob.getBlockPos(),
                    SoundEvents.ENTITY_ENDERMAN_TELEPORT, SoundCategory.HOSTILE,
                    1.0f, 1.0f);

            mob.teleport(world, tx, ty, tz, java.util.Set.of(), mob.getYaw(), mob.getPitch(), false);

            world.spawnParticles(
                    ParticleTypes.PORTAL, tx, ty + 1.0, tz,
                    32, 0.5, 1.0, 0.5, 0.1
            );

        } else if (cmd.has("ShootArrow")) {
            JsonObject shoot = cmd.getAsJsonObject("ShootArrow");
            long targetId = shoot.get("target_entity").getAsLong();
            float power = shoot.has("power") ? shoot.get("power").getAsFloat() : 0.8f;

            Entity target = world.getEntityById((int) targetId);
            if (target instanceof LivingEntity living && living.isAlive()) {
                ArrowEntity arrow = new ArrowEntity(world, mob, new net.minecraft.item.ItemStack(net.minecraft.item.Items.ARROW), null);
                // Aim at the target's eye height
                Vec3d toTarget = new Vec3d(
                        living.getX() - mob.getX(),
                        living.getEyeY() - arrow.getY(),
                        living.getZ() - mob.getZ()
                );
                double dist = toTarget.horizontalLength();
                arrow.setVelocity(
                        toTarget.x, toTarget.y + dist * 0.2, toTarget.z,
                        power * 3.0f, 1.0f
                );
                world.spawnEntity(arrow);
                world.playSound(null, mob.getBlockPos(),
                        SoundEvents.ENTITY_SKELETON_SHOOT, SoundCategory.HOSTILE,
                        1.0f, 1.0f / (world.getRandom().nextFloat() * 0.4f + 0.8f));
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

        } else if (cmd.has("SpawnSkeletonMelee")) {
            JsonObject spawn = cmd.getAsJsonObject("SpawnSkeletonMelee");
            int playerId = spawn.get("near_player").getAsInt();
            int radius = spawn.get("radius").getAsInt();
            creatureManager.spawnNearPlayer(world, CreatureKinds.SKELETON_MELEE, playerId, radius, false);

        } else if (cmd.has("SpawnSkeletonMage")) {
            JsonObject spawn = cmd.getAsJsonObject("SpawnSkeletonMage");
            int playerId = spawn.get("near_player").getAsInt();
            int radius = spawn.get("radius").getAsInt();
            creatureManager.spawnNearPlayer(world, CreatureKinds.SKELETON_MAGE, playerId, radius, false);

        } else if (cmd.has("SpawnSkeletonArcher")) {
            JsonObject spawn = cmd.getAsJsonObject("SpawnSkeletonArcher");
            int playerId = spawn.get("near_player").getAsInt();
            int radius = spawn.get("radius").getAsInt();
            creatureManager.spawnNearPlayer(world, CreatureKinds.SKELETON_ARCHER, playerId, radius, false);

        } else if (cmd.has("MoveShip")) {
            JsonObject move = cmd.getAsJsonObject("MoveShip");
            String shipIdStr = move.get("ship_id").getAsString();
            int distance = move.get("distance").getAsInt();
            try {
                shipManager.moveShip(java.util.UUID.fromString(shipIdStr), distance);
            } catch (IllegalArgumentException e) {
                LOGGER.warn("[AI] Invalid ship UUID in MoveShip: {}", shipIdStr);
            }

        } else if (cmd.has("DespawnShip")) {
            JsonObject despawn = cmd.getAsJsonObject("DespawnShip");
            String shipIdStr = despawn.get("ship_id").getAsString();
            try {
                shipManager.removeShip(world, java.util.UUID.fromString(shipIdStr));
            } catch (IllegalArgumentException e) {
                LOGGER.warn("[AI] Invalid ship UUID in DespawnShip: {}", shipIdStr);
            }

        } else if (cmd.has("SpawnShip")) {
            JsonObject spawn = cmd.getAsJsonObject("SpawnShip");
            String shipName = spawn.get("ship_name").getAsString();
            int playerId = (int) spawn.get("near_player").getAsLong();
            Entity player = world.getEntityById(playerId);
            if (player != null) {
                com.kbve.statetree.ship.ShipData data =
                        com.kbve.statetree.ship.SchematicLoader.loadFromResource(
                                shipName, "/schematics/" + shipName + ".nbt");
                if (data != null) {
                    shipManager.placeShip(world, data, player.getUuid(), player.getBlockPos());
                }
            }

        } else if (cmd.has("Despawn")) {
            JsonObject despawn = cmd.getAsJsonObject("Despawn");
            int targetId = (int) despawn.get("target_entity").getAsLong();
            creatureManager.despawnEntity(world, targetId);
        }
    }
}
