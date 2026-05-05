package com.kbve.mcuplink;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.network.PacketByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.packet.CustomPayload;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.command.CommandOutput;
import net.minecraft.server.command.ServerCommandSource;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * KBVE MC Uplink — Fabric edition.
 *
 * Forwards backend gameplay events (death, advancement) to the Velocity-side
 * {@code kbve-discord-relay} plugin over the {@code kbve:relay-events}
 * plugin-messaging channel, and runs Discord-issued commands locally
 * via the same channel ({@code exec} payloads).
 *
 * <p>Backend stays Discord-blind: no JDA, no HTTP, no Discord token.
 * Player events ride on the existing player→proxy connection via Fabric's
 * networking API.
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
        // Register the payload for both directions:
        //   S2C: outbound death + advancement + exec_result
        //   C2S: inbound exec from the proxy (Velocity spoofs as a client packet)
        PayloadTypeRegistry.playS2C().register(PAYLOAD_ID, PAYLOAD_CODEC);
        PayloadTypeRegistry.playC2S().register(PAYLOAD_ID, PAYLOAD_CODEC);

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

        // Inbound exec — Discord-issued backend command from the proxy.
        ServerPlayNetworking.registerGlobalReceiver(PAYLOAD_ID, (payload, context) -> {
            handleExec(context.server(), context.player(), payload.bytes());
        });

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

    private static void handleExec(MinecraftServer server, ServerPlayerEntity player, byte[] data) {
        RelayWire.ExecRequest req;
        try {
            req = RelayWire.parseExec(data);
        } catch (Throwable t) {
            LOGGER.warn("[{}] failed to parse exec payload: {}", MOD_ID, t.getMessage());
            return;
        }
        if (req == null) return; // not an exec payload

        // Run on the main thread — command execution touches world state.
        server.execute(() -> {
            CapturingOutput out = new CapturingOutput();
            ServerCommandSource source = server.getCommandSource()
                    .withOutput(out)
                    .withSilent();
            boolean ok;
            try {
                server.getCommandManager().parseAndExecute(source, req.command());
                ok = !out.captured().isEmpty();
            } catch (Throwable t) {
                LOGGER.warn("[{}] dispatch threw for '{}': {}", MOD_ID, req.command(), t.getMessage());
                out.appendLine("Error: " + (t.getMessage() != null ? t.getMessage() : t.getClass().getSimpleName()));
                ok = false;
            }
            byte[] reply = RelayWire.execResultPayload(req.correlation(), ok, out.captured());
            send(player, reply);
        });
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

    /** CommandOutput that captures every sendMessage call as plain text. */
    private static final class CapturingOutput implements CommandOutput {
        private final StringBuilder buffer = new StringBuilder();

        String captured() {
            return buffer.toString().strip();
        }

        void appendLine(String line) {
            buffer.append(line).append('\n');
        }

        @Override
        public void sendMessage(Text message) {
            appendLine(message.getString());
        }

        @Override public boolean shouldReceiveFeedback() { return true; }
        @Override public boolean shouldTrackOutput() { return true; }
        @Override public boolean shouldBroadcastConsoleToOps() { return false; }
    }
}
