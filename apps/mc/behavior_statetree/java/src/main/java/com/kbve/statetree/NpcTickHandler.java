package com.kbve.statetree;

import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.server.MinecraftServer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Server tick handler — the sync boundary between Fabric and Tokio.
 *
 * <p>Each tick:
 * <ol>
 *   <li>Gather NPC observations (positions, health, nearby entities)</li>
 *   <li>Submit observations to the Tokio runtime via JNI</li>
 *   <li>Poll completed intents from the Tokio runtime</li>
 *   <li>Validate intents (epoch check) and apply commands to entities</li>
 * </ol>
 *
 * <p>The Fabric server tick thread is the ONLY thread that mutates entity state.
 * Tokio tasks produce immutable intents that are validated here before application.
 */
public class NpcTickHandler implements ServerTickEvents.EndTick {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    @Override
    public void onEndTick(MinecraftServer server) {
        if (!NativeRuntime.isLoaded()) {
            return;
        }

        // Phase 1: Gather observations and submit to Tokio
        // TODO: iterate over NPC entities, build NpcObservation JSON, call NativeRuntime.submitJob()

        // Phase 2: Poll completed intents from Tokio
        String intentsJson = NativeRuntime.pollIntents();
        if (intentsJson == null || intentsJson.equals("[]")) {
            return;
        }

        // Phase 3: Parse intents, validate epochs, apply commands
        // TODO: deserialize NpcIntent[], check epoch against current NPC epoch,
        //       apply NpcCommands (MoveTo, Attack, Interact, etc.) via server entity API
    }
}
