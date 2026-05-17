package com.kbve.mcauth;

import com.google.gson.JsonObject;
import net.minecraft.registry.RegistryKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.util.Identifier;
import net.minecraft.world.World;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;

public final class PlayerSnapshotHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger(McAuthMod.MOD_ID);

    public static final String SERVER_ID_ENV = "KBVE_MC_SERVER_ID";
    public static final String DEFAULT_SERVER_ID = "kbve-mc-fabric";

    private PlayerSnapshotHandler() {}

    public static String serverId() {
        String env = System.getenv(SERVER_ID_ENV);
        return (env != null && !env.isEmpty()) ? env : DEFAULT_SERVER_ID;
    }

    public static void requestLoad(ServerPlayerEntity player) {
        if (!NativeRuntime.isLoaded() || player == null) {
            return;
        }
        try {
            NativeRuntime.loadPlayerSnapshot(player.getUuidAsString(), serverId());
        } catch (Throwable t) {
            LOGGER.warn("[{}] loadPlayerSnapshot threw: {}", McAuthMod.MOD_ID, t.getMessage());
        }
    }

    public static void requestSave(ServerPlayerEntity player) {
        if (!NativeRuntime.isLoaded() || player == null) {
            return;
        }
        try {
            String json = buildSnapshotJson(player);
            NativeRuntime.savePlayerSnapshot(player.getUuidAsString(), json);
        } catch (Throwable t) {
            LOGGER.warn("[{}] savePlayerSnapshot threw: {}", McAuthMod.MOD_ID, t.getMessage());
        }
    }

    public static void applyLoadedSnapshot(MinecraftServer server, String uuid, String snapshotJson) {
        if (server == null || snapshotJson == null || snapshotJson.isEmpty()) {
            return;
        }
        ServerPlayerEntity player;
        try {
            player = server.getPlayerManager().getPlayer(java.util.UUID.fromString(uuid));
        } catch (IllegalArgumentException e) {
            return;
        }
        if (player == null) {
            return;
        }
        try {
            JsonObject row = com.google.gson.JsonParser.parseString(snapshotJson).getAsJsonObject();
            double x = row.has("pos_x") ? row.get("pos_x").getAsDouble() : player.getX();
            double y = row.has("pos_y") ? row.get("pos_y").getAsDouble() : player.getY();
            double z = row.has("pos_z") ? row.get("pos_z").getAsDouble() : player.getZ();
            float yaw = row.has("pos_yaw") ? row.get("pos_yaw").getAsFloat() : player.getYaw();
            float pitch = row.has("pos_pitch") ? row.get("pos_pitch").getAsFloat() : player.getPitch();
            String worldId = row.has("world") && !row.get("world").isJsonNull()
                    ? row.get("world").getAsString()
                    : "minecraft:overworld";

            RegistryKey<World> worldKey = RegistryKey.of(
                    net.minecraft.registry.RegistryKeys.WORLD,
                    Identifier.of(worldId));
            net.minecraft.server.world.ServerWorld targetWorld = server.getWorld(worldKey);
            if (targetWorld == null) {
                targetWorld = server.getOverworld();
            }
            player.teleport(targetWorld, x, y, z, java.util.EnumSet.noneOf(net.minecraft.network.packet.s2c.play.PositionFlag.class), yaw, pitch, false);

            if (row.has("health") && !row.get("health").isJsonNull()) {
                player.setHealth(row.get("health").getAsFloat());
            }
            if (row.has("food_level") && !row.get("food_level").isJsonNull()) {
                player.getHungerManager().setFoodLevel(row.get("food_level").getAsInt());
            }
            if (row.has("saturation") && !row.get("saturation").isJsonNull()) {
                player.getHungerManager().setSaturationLevel(row.get("saturation").getAsFloat());
            }
            if (row.has("xp_level") && !row.get("xp_level").isJsonNull()) {
                player.experienceLevel = row.get("xp_level").getAsInt();
            }
            if (row.has("xp_points") && !row.get("xp_points").isJsonNull()) {
                player.totalExperience = row.get("xp_points").getAsInt();
            }
            LOGGER.info(
                    "[{}] Restored snapshot for {} at ({},{},{}) in {}",
                    McAuthMod.MOD_ID,
                    uuid,
                    x,
                    y,
                    z,
                    worldId);
        } catch (Throwable t) {
            LOGGER.warn("[{}] applyLoadedSnapshot failed for {}: {}", McAuthMod.MOD_ID, uuid, t.toString());
        }
    }

    private static String buildSnapshotJson(ServerPlayerEntity player) {
        JsonObject root = new JsonObject();
        root.addProperty("player_uuid", player.getUuidAsString());
        root.addProperty("server_id", serverId());
        root.addProperty("player_name", player.getNameForScoreboard());

        JsonObject position = new JsonObject();
        position.addProperty("x", player.getX());
        position.addProperty("y", player.getY());
        position.addProperty("z", player.getZ());
        position.addProperty("yaw", player.getYaw());
        position.addProperty("pitch", player.getPitch());
        position.addProperty("world", player.getEntityWorld().getRegistryKey().getValue().toString());
        root.add("position", position);

        root.addProperty("game_mode", player.interactionManager.getGameMode().getId());
        root.addProperty("health", player.getHealth());
        root.addProperty("food_level", player.getHungerManager().getFoodLevel());
        root.addProperty("saturation", player.getHungerManager().getSaturationLevel());
        root.addProperty("experience_level", player.experienceLevel);
        root.addProperty("experience_points", player.totalExperience);

        JsonObject inventory = new JsonObject();
        inventory.add("slots", new com.google.gson.JsonArray());
        root.add("inventory", inventory);
        root.add("ender_chest", new com.google.gson.JsonArray());

        root.addProperty("captured_at", Instant.now().toString());
        return root.toString();
    }
}
