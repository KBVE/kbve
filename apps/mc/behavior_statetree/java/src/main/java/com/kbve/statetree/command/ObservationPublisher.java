package com.kbve.statetree.command;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.kbve.statetree.AiCreatureManager;
import com.kbve.statetree.MapScanner;
import com.kbve.statetree.NativeRuntime;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;

/**
 * Publishes observation snapshots to Rust on a throttled schedule.
 * Extracted from NpcTickHandler to keep the orchestrator thin.
 */
public final class ObservationPublisher {

    private static final Gson GSON = new Gson();

    private final AiCreatureManager creatureManager;

    public ObservationPublisher(AiCreatureManager creatureManager) {
        this.creatureManager = creatureManager;
    }

    /** Push player snapshot + per-creature observations to Rust. */
    public void publishObservations(MinecraftServer server) {
        submitPlayerSnapshot(server);
        creatureManager.submitObservations(server);
    }

    /** Push a 64x64 walkability grid to Rust for flow fields. */
    public void publishMapScan(MinecraftServer server) {
        ServerWorld overworld = server.getOverworld();
        if (overworld != null) {
            MapScanner.scanAndSubmit(overworld, overworld.getTime());
        }
    }

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
}
