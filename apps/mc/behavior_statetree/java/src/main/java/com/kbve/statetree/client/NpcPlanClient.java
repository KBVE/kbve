package com.kbve.statetree.client;

import com.kbve.statetree.command.NpcPlanPayload;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.entity.Entity;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.text.Text;
import net.minecraft.util.math.Vec3d;
import org.lwjgl.glfw.GLFW;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Client half of the NPC plan channel: receives
 * {@code behavior_statetree:npc_plan} payloads into {@link NpcPlanRegistry}
 * and offers a keybind-toggled particle overlay showing where each AI mob
 * intends to go.
 *
 * <p>Particles instead of world-space line rendering on purpose — the
 * 1.21.9+ render pipeline rework made custom debug line drawing fragile
 * across versions, while {@code world.addParticle} is stable and cheap.
 */
public final class NpcPlanClient {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    /** Overlay refresh cadence in client ticks (10 = twice a second). */
    private static final int RENDER_INTERVAL = 10;

    /** Ignore plans farther than this from the camera (squared blocks). */
    private static final double MAX_RENDER_DIST_SQ = 64.0 * 64.0;

    private static KeyBinding toggleKey;
    private static boolean overlayEnabled = false;
    private static int tickCounter = 0;

    private NpcPlanClient() {}

    public static void register() {
        ClientPlayNetworking.registerGlobalReceiver(NpcPlanPayload.ID, (payload, context) ->
                NpcPlanRegistry.put(payload.entityId(), payload.kind(),
                        payload.x(), payload.y(), payload.z(), payload.targetEntityId()));

        ClientPlayConnectionEvents.DISCONNECT.register((handler, client) ->
                NpcPlanRegistry.clear());

        toggleKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
                "key.behavior_statetree.npcplans",
                InputUtil.Type.KEYSYM,
                GLFW.GLFW_KEY_B,
                KeyBinding.Category.MISC));

        ClientTickEvents.END_CLIENT_TICK.register(NpcPlanClient::onClientTick);

        LOGGER.info("[NpcPlan Client] Registered — plan receiver + overlay keybind ready");
    }

    private static void onClientTick(MinecraftClient client) {
        if (client.player == null || client.world == null) return;

        while (toggleKey != null && toggleKey.wasPressed()) {
            overlayEnabled = !overlayEnabled;
            client.player.sendMessage(
                    Text.of("NPC plan overlay " + (overlayEnabled ? "ON" : "OFF")), true);
        }

        tickCounter++;
        if (tickCounter % RENDER_INTERVAL != 0) return;

        NpcPlanRegistry.prune();
        if (!overlayEnabled) return;

        Vec3d camera = client.player.getEyePos();
        for (var entry : NpcPlanRegistry.all().entrySet()) {
            Entity mob = client.world.getEntityById(entry.getKey());
            if (mob == null || !mob.isAlive()) continue;
            if (mob.squaredDistanceTo(camera) > MAX_RENDER_DIST_SQ) continue;
            drawPlan(client, mob, entry.getValue());
        }
    }

    private static void drawPlan(MinecraftClient client, Entity mob,
                                 NpcPlanRegistry.NpcPlan plan) {
        Vec3d from = mob.getEyePos();
        Vec3d to = plan.target().add(0, 0.25, 0);
        boolean attack = "attack".equals(plan.kind());

        Vec3d delta = to.subtract(from);
        double length = delta.length();
        int points = (int) Math.min(24, Math.max(2, length / 1.5));
        for (int i = 0; i <= points; i++) {
            Vec3d p = from.add(delta.multiply((double) i / points));
            client.particleManager.addParticle(
                    attack ? ParticleTypes.CRIT : ParticleTypes.END_ROD,
                    p.x, p.y, p.z, 0, 0, 0);
        }

        for (int i = 0; i < 3; i++) {
            client.particleManager.addParticle(
                    attack ? ParticleTypes.CRIT : ParticleTypes.END_ROD,
                    to.x, to.y + i * 0.5, to.z, 0, 0.02, 0);
        }
    }
}
