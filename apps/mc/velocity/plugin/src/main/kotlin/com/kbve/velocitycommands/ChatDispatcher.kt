package com.kbve.velocitycommands

import com.velocitypowered.api.proxy.ProxyServer
import net.kyori.adventure.text.Component
import net.kyori.adventure.text.format.NamedTextColor

/**
 * Helper that broadcasts Components to in-game players, scoped either
 * to the whole network or to a single backend server.
 *
 * Pulled out of [KbveVelocityCommands] so [DiscordRelay] can call into
 * it without depending on the entire plugin object.
 */
class ChatDispatcher(private val server: ProxyServer) {

    /** Broadcast to every connected player on every backend. */
    fun broadcastGlobal(component: Component) {
        for (player in server.allPlayers) {
            player.sendMessage(component)
        }
    }

    /**
     * Broadcast only to players currently connected to [serverName].
     * Returns the number of recipients (useful for command feedback).
     */
    fun broadcastToServer(serverName: String, component: Component): Int {
        var count = 0
        for (player in server.allPlayers) {
            val current = player.currentServer.orElse(null) ?: continue
            if (current.serverInfo.name == serverName) {
                player.sendMessage(component)
                count++
            }
        }
        return count
    }

    /**
     * Send a Component to a single player by username (case-insensitive
     * exact match). Returns true if the player was found.
     */
    fun sendToPlayer(username: String, component: Component): Boolean {
        val target = server.allPlayers.firstOrNull { it.username.equals(username, ignoreCase = true) }
            ?: return false
        target.sendMessage(component)
        return true
    }

    companion object {
        // Shared color palette so all Discord-originated chat looks consistent
        // and is visually distinct from native player chat.
        val COLOR_DISCORD_GLOBAL = NamedTextColor.AQUA
        val COLOR_DISCORD_LOBBY = NamedTextColor.GRAY
        val COLOR_DISCORD_SURVIVAL = NamedTextColor.GOLD
        val COLOR_DISCORD_DM = NamedTextColor.LIGHT_PURPLE
        val COLOR_DISCORD_STAFF_SAY = NamedTextColor.RED
    }
}
