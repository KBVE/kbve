package com.kbve.discordrelay

import com.velocitypowered.api.proxy.ProxyServer
import com.velocitypowered.api.proxy.messages.ChannelIdentifier
import net.dv8tion.jda.api.events.message.MessageReceivedEvent
import org.slf4j.Logger
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/**
 * Routes Discord-issued backend commands over the kbve:relay-events channel.
 *
 * Outbound flow (proxy → backend):
 *   1. [executeOnBackend] is called by [DiscordBot] with target server name,
 *      raw command string, verbose flag, and the Discord [MessageReceivedEvent].
 *   2. Generates a fresh correlation UUID, parks the event in [pending].
 *   3. Builds an `exec` JSON payload, picks any online player on the target
 *      server, sends via that player's ServerConnection.
 *   4. Schedules a 5s timeout that fires `⏱️ no response` if the backend
 *      doesn't reply.
 *
 * Inbound flow (backend → proxy):
 *   [RelayEventChannel] decodes an `exec_result` JSON payload and calls
 *   [completeExec], which looks up the correlation, posts the appropriate
 *   reply, and evicts the entry.
 */
class ExecRouter(
    private val server: ProxyServer,
    private val logger: Logger,
    private val channel: ChannelIdentifier,
) {

    private data class Pending(
        val event: MessageReceivedEvent,
        val verbose: Boolean,
        val target: String,
    )

    private val pending = ConcurrentHashMap<UUID, Pending>()
    private val timeouts: ScheduledExecutorService =
        Executors.newSingleThreadScheduledExecutor { r ->
            Thread(r, "kbve-discord-relay-exec-timeouts").apply { isDaemon = true }
        }

    /**
     * Returns true if the command was successfully sent over the channel.
     * On false the caller is expected to post an error reply.
     */
    fun executeOnBackend(
        target: String,
        command: String,
        verbose: Boolean,
        event: MessageReceivedEvent,
    ): Boolean {
        // Pick any player on the target server to ride the channel through.
        val player = server.allPlayers.firstOrNull { p ->
            p.currentServer.map { it.serverInfo.name == target }.orElse(false)
        } ?: return false

        val correlation = UUID.randomUUID()
        pending[correlation] = Pending(event, verbose, target)

        val payload = execPayload(correlation, command)
        val sent = player.currentServer.map { sc ->
            sc.sendPluginMessage(channel, payload)
        }.orElse(false)

        if (!sent) {
            pending.remove(correlation)
            return false
        }

        timeouts.schedule({
            val expired = pending.remove(correlation)
            if (expired != null) {
                replySafe(expired.event, "⏱️ no response from ${expired.target}")
            }
        }, EXEC_TIMEOUT_SECONDS, TimeUnit.SECONDS)

        return true
    }

    /** Called from RelayEventChannel when an `exec_result` payload arrives. */
    fun completeExec(correlation: UUID, ok: Boolean, output: String) {
        val p = pending.remove(correlation) ?: run {
            logger.info("Ignoring exec_result for unknown correlation {}", correlation)
            return
        }
        when {
            !ok -> {
                val body = output.ifBlank { "command failed" }.take(MAX_OUTPUT_CHARS)
                replySafe(p.event, "⚠️ ${codeBlock(body)}")
            }
            !p.verbose -> {
                p.event.message.addReaction(
                    net.dv8tion.jda.api.entities.emoji.Emoji.fromUnicode("✅")
                ).queue()
            }
            output.isBlank() -> {
                replySafe(p.event, "✅ ran (no output)")
            }
            else -> {
                replySafe(p.event, "✅\n${codeBlock(output.take(MAX_OUTPUT_CHARS))}")
            }
        }
    }

    fun shutdown() {
        timeouts.shutdownNow()
    }

    private fun replySafe(event: MessageReceivedEvent, content: String) {
        try {
            event.message.reply(content).mentionRepliedUser(false).queue()
        } catch (t: Throwable) {
            logger.warn("Failed to reply to Discord message", t)
        }
    }

    private fun codeBlock(s: String): String = "```\n$s\n```"

    private fun execPayload(correlation: UUID, command: String): ByteArray {
        val json = JsonWriter.obj()
            .field("type", "exec")
            .field("uuid", correlation.toString())
            .field("data", JsonWriter.obj().field("command", command))
            .build()
        val baos = ByteArrayOutputStream()
        DataOutputStream(baos).use { it.writeUTF(json) }
        return baos.toByteArray()
    }

    companion object {
        const val EXEC_TIMEOUT_SECONDS = 5L
        const val MAX_OUTPUT_CHARS = 1500
    }
}
