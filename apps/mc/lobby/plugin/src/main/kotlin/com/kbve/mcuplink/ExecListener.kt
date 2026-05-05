package com.kbve.mcuplink

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import net.kyori.adventure.text.Component
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer
import org.bukkit.Bukkit
import org.bukkit.command.CommandSender
import org.bukkit.entity.Player
import org.bukkit.plugin.Plugin
import org.bukkit.plugin.messaging.PluginMessageListener
import java.io.DataInputStream

/**
 * Listens on the kbve:relay-events channel for `exec` payloads from the
 * Velocity-side relay. Runs the requested command against a buffered
 * console sender (so stdout output is captured), then sends back an
 * `exec_result` payload with the captured output.
 *
 * Replies ride on whichever player connection the relay used to forward
 * the payload (Bukkit's plugin-messaging API requires a player handle).
 */
class ExecListener(private val plugin: Plugin) : PluginMessageListener {

    override fun onPluginMessageReceived(channel: String, player: Player, message: ByteArray) {
        if (channel != RelayWire.CHANNEL) return
        val raw = try {
            DataInputStream(message.inputStream()).readUTF()
        } catch (t: Throwable) {
            plugin.logger.warning("kbve-mc-uplink: failed to read UTF payload: ${t.message}")
            return
        }
        val obj = try {
            JsonParser.parseString(raw).asJsonObject
        } catch (t: Throwable) {
            plugin.logger.warning("kbve-mc-uplink: malformed JSON: ${raw.take(200)}")
            return
        }
        val type = obj.optString("type") ?: return
        if (type != "exec") return
        val correlation = obj.optString("uuid") ?: return
        val data = if (obj.has("data") && obj.get("data").isJsonObject) obj.getAsJsonObject("data") else JsonObject()
        val command = data.optString("command")?.takeIf { it.isNotBlank() } ?: return

        // Run on the main thread — Bukkit dispatchCommand isn't thread-safe.
        Bukkit.getScheduler().runTask(plugin, Runnable {
            val capture = BufferedConsoleSender(Bukkit.getConsoleSender())
            val ok = try {
                Bukkit.getServer().dispatchCommand(capture, command)
            } catch (t: Throwable) {
                plugin.logger.warning("kbve-mc-uplink: dispatchCommand threw for '$command': ${t.message}")
                capture.appendLine("Error: ${t.message ?: t::class.java.simpleName}")
                false
            }
            val output = capture.captured
            val payload = RelayWire.execResultPayload(correlation, ok, output)
            try {
                player.sendPluginMessage(plugin, RelayWire.CHANNEL, payload)
            } catch (t: Throwable) {
                plugin.logger.warning("kbve-mc-uplink: failed to send exec_result: ${t.message}")
            }
        })
    }

    private fun JsonObject.optString(key: String): String? =
        if (has(key) && !get(key).isJsonNull && get(key).isJsonPrimitive) get(key).asString else null
}

/**
 * CommandSender wrapper that captures every sendMessage call as plain text.
 * Delegates everything else (permissions, op status, name) to the underlying
 * console sender so commands that gate on those behave normally.
 *
 * Only the two sendMessage overloads vanilla + commonly-used plugins call
 * are intercepted: String and Component. Other Adventure overloads route
 * through these via Adventure's default audience plumbing.
 */
private class BufferedConsoleSender(delegate: CommandSender) : CommandSender by delegate {
    private val buffer = StringBuilder()

    val captured: String get() = buffer.toString().trimEnd()

    fun appendLine(line: String) {
        buffer.append(line).append('\n')
    }

    override fun sendMessage(message: String) {
        appendLine(message)
    }

    override fun sendMessage(vararg messages: String) {
        for (m in messages) appendLine(m)
    }

    override fun sendMessage(message: Component) {
        appendLine(PlainTextComponentSerializer.plainText().serialize(message))
    }
}
