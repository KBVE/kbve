package com.kbve.mcuplink;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.network.PacketByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.packet.CustomPayload;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.util.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * KBVE MC Uplink — Fabric edition.
 *
 * Forwards backend gameplay events (death, advancement) to the Velocity-side
 * {@code kbve-discord-relay} plugin over the {@code kbve:relay-events}
 * plugin-messaging channel.
 *
 * <p>Backend stays Discord-blind: no JDA, no HTTP, no Discord token.
 * Player events ride on the existing player→proxy connection via Fabric's
 * networking API.
 *
 * <p>Wire format mirrors the Paper edition: a length-prefixed UTF JSON
 * blob ({@code DataOutputStream.writeUTF(...)} convention).
 */
public final class KbveMcUplink implements ModInitializer {

    public static final String MOD_ID = "kbve_mc_uplink";
    public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    public static final Identifier CHANNEL_ID =
            Identifier.of(RelayWire.CHANNEL_NAMESPACE, RelayWire.CHANNEL_NAME);

    public static final CustomPayload.Id<RelayPayload> PAYLOAD_ID =
            new CustomPayload.Id<>(CHANNEL_ID);

    public static final PacketCodec<PacketByteBuf, RelayPayload> PAYLOAD_CODEC =
            CustomPayload.codecOf(
                    (payload, buf) -> buf.writeBytes(payload.bytes()),
                    buf -> {
                        byte[] data = new byte[buf.readableBytes()];
                        buf.readBytes(data);
                        return new RelayPayload(data);
                    });

    @Override
    public void onInitialize() {
        // Register the payload type for outbound (S2C) so we can ServerPlayNetworking.send.
        // Velocity's PluginMessageEvent receives the raw bytes regardless.
        PayloadTypeRegistry.playS2C().register(PAYLOAD_ID, PAYLOAD_CODEC);

        // Death — fires after the player entity is marked dead.
        ServerLivingEntityEvents.AFTER_DEATH.register((entity, source) -> {
            if (entity instanceof ServerPlayerEntity player) {
                String message = source.getDeathMessage(player).getString();
                if (message == null || message.isBlank()) return;
                send(player, RelayWire.deathPayload(
                        player.getUuid().toString(),
                        player.getNameForScoreboard(),
                        message));
            }
        });

        // Advancement — driven by the mixin on PlayerAdvancementTracker#grantCriterion.

        LOGGER.info("[{}] kbve-mc-uplink initialized (channel={})", MOD_ID, CHANNEL_ID);
    }

    /** Called from the mixin when an announce-to-chat advancement is granted. */
    public static void onAdvancement(ServerPlayerEntity player, String title, String key) {
        send(player, RelayWire.advancementPayload(
                player.getUuid().toString(),
                player.getNameForScoreboard(),
                title,
                key));
    }

    private static void send(ServerPlayerEntity player, byte[] data) {
        try {
            ServerPlayNetworking.send(player, new RelayPayload(data));
        } catch (Throwable t) {
            LOGGER.warn("[{}] failed to send relay payload for {}", MOD_ID, player.getNameForScoreboard(), t);
        }
    }

    /** Wraps the raw framed payload bytes for Fabric's CustomPayload contract. */
    public record RelayPayload(byte[] bytes) implements CustomPayload {
        @Override
        public Id<? extends CustomPayload> getId() {
            return PAYLOAD_ID;
        }
    }
}
