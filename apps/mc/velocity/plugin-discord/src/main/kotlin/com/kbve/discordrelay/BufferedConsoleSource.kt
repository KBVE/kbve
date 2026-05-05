package com.kbve.discordrelay

import com.velocitypowered.api.command.CommandSource
import com.velocitypowered.api.permission.Tristate
import net.kyori.adventure.text.Component
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer

/**
 * Wraps a Velocity [CommandSource] and captures every [sendMessage] call as
 * plain text in an internal buffer. Used by the Discord relay's proxy-side
 * `>cmd proxy <command>` path so the bot can return the actual command
 * output (the real `/glist` player list, etc.) instead of just a fixed
 * acknowledgement string.
 *
 * Permission checks delegate to the wrapped console source so commands that
 * gate on `velocity.command.foo` etc. behave identically.
 */
class BufferedConsoleSource(private val delegate: CommandSource) : CommandSource {

    private val buffer = StringBuilder()

    val captured: String get() = buffer.toString().trimEnd()

    override fun sendMessage(message: Component) {
        buffer.append(PlainTextComponentSerializer.plainText().serialize(message)).append('\n')
    }

    override fun getPermissionValue(permission: String): Tristate =
        delegate.getPermissionValue(permission)
}
