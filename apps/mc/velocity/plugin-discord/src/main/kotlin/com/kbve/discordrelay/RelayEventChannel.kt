package com.kbve.discordrelay

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.velocitypowered.api.event.connection.PluginMessageEvent
import com.velocitypowered.api.proxy.messages.ChannelIdentifier
import com.velocitypowered.api.proxy.ServerConnection
import org.slf4j.Logger
import java.io.DataInputStream
import java.util.UUID

/**
 * Receives backend-server gameplay events over the `kbve:relay-events`
 * plugin-messaging channel and renders them as Discord embeds via [DiscordBot].
 *
 * Wire format:
 *   `DataOutputStream.writeUTF(jsonString)` — i.e. a 2-byte unsigned big-endian
 *   length prefix followed by the modified-UTF-8 bytes of a JSON object:
 *
 *   ```json
 *   { "type": "death" | "advancement" | "join" | "leave" | "chat",
 *     "uuid": "<dashed-uuid>",
 *     "name": "<player-name>",
 *     "server": "lobby" | "mc",
 *     "data": { ...type-specific fields... } }
 *   ```
 *
 * Backend join/leave are reserved for parity with the proxy-side events and
 * are currently no-ops here (the proxy fires its own ServerConnectedEvent /
 * DisconnectEvent embeds). Backend `chat` is also reserved for v2.
 *
 * Unknown `type` values are logged at INFO and dropped — old proxies stay
 * forward-compatible with new backend event types.
 */
class RelayEventChannel(
    private val logger: Logger,
    private val bot: DiscordBot,
    private val channel: ChannelIdentifier,
    private val execRouter: ExecRouter,
) {

    fun handle(event: PluginMessageEvent) {
        if (event.identifier != channel) return
        // Backend sender — Velocity wraps server connections in ServerConnection.
        // We only accept messages from backend servers, never from clients
        // (clients shouldn't be able to write to a server-only channel anyway,
        // but defense in depth).
        if (event.source !is ServerConnection) {
            logger.warn("Dropping {} from non-server source: {}", channel.id, event.source.javaClass.simpleName)
            return
        }
        // Mark the event as handled so Velocity doesn't forward to the client.
        event.result = PluginMessageEvent.ForwardResult.handled()

        val obj = parse(event.data) ?: return
        val type = obj.optString("type") ?: return
        val name = obj.optString("name") ?: "?"
        val uuid = obj.optString("uuid")?.let(::tryUuid)
        val serverName = obj.optString("server") ?: "?"
        val data = if (obj.has("data") && obj.get("data").isJsonObject) obj.getAsJsonObject("data") else JsonObject()

        when (type) {
            "death" -> {
                val message = data.optString("message") ?: "$name died"
                bot.postSystemEmbed("💀 $message", DiscordBot.COLOR_DEATH, uuid)
            }
            "advancement" -> {
                val title = data.optString("title") ?: "?"
                bot.postSystemEmbed("🏆 $name earned [$title]", DiscordBot.COLOR_ADVANCEMENT, uuid)
            }
            "exec_result" -> {
                val correlation = uuid ?: run {
                    logger.warn("exec_result missing uuid")
                    return
                }
                val ok = data.optBoolean("ok") ?: false
                val output = data.optString("output").orEmpty()
                execRouter.completeExec(correlation, ok, output)
            }
            "join", "leave", "chat" -> {
                // Reserved for future backend-side variants. Proxy already handles
                // join/leave embeds via ServerConnectedEvent + DisconnectEvent and
                // chat via PlayerChatEvent — no need to duplicate.
            }
            else -> {
                logger.info("Unknown {} event type '{}' from server={}", channel.id, type, serverName)
            }
        }
    }

    private fun parse(bytes: ByteArray): JsonObject? {
        val raw = try {
            DataInputStream(bytes.inputStream()).readUTF()
        } catch (t: Throwable) {
            logger.warn("Failed to read UTF payload on {}", channel.id, t)
            return null
        }
        return try {
            JsonParser.parseString(raw).asJsonObject
        } catch (t: Throwable) {
            logger.warn("Malformed JSON on {}: {}", channel.id, raw.take(200))
            null
        }
    }

    private fun tryUuid(s: String): UUID? = try { UUID.fromString(s) } catch (_: Throwable) { null }

    private fun JsonObject.optString(key: String): String? =
        if (has(key) && !get(key).isJsonNull && get(key).isJsonPrimitive) get(key).asString else null

    private fun JsonObject.optBoolean(key: String): Boolean? =
        if (has(key) && !get(key).isJsonNull && get(key).isJsonPrimitive && get(key).asJsonPrimitive.isBoolean)
            get(key).asBoolean else null
}
