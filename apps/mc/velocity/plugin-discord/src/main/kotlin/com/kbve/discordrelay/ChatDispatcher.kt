package com.kbve.discordrelay

import com.velocitypowered.api.proxy.ProxyServer
import net.kyori.adventure.text.Component
import net.kyori.adventure.text.format.NamedTextColor

/**
 * Helper that broadcasts Components to in-game players, scoped either
 * to the whole network or to a single backend server.
 */
class ChatDispatcher(private val server: ProxyServer) {

    fun broadcastGlobal(component: Component) {
        for (player in server.allPlayers) {
            player.sendMessage(component)
        }
    }

    /** Returns the number of recipients (useful for command feedback). */
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

    /** Returns true if the player was found. Case-insensitive exact match. */
    fun sendToPlayer(username: String, component: Component): Boolean {
        val target = server.allPlayers.firstOrNull { it.username.equals(username, ignoreCase = true) }
            ?: return false
        target.sendMessage(component)
        return true
    }

    companion object {
        val COLOR_DISCORD_GLOBAL = NamedTextColor.AQUA
        val COLOR_DISCORD_LOBBY = NamedTextColor.GRAY
        val COLOR_DISCORD_SURVIVAL = NamedTextColor.GOLD
        val COLOR_DISCORD_DM = NamedTextColor.LIGHT_PURPLE
        val COLOR_DISCORD_STAFF_SAY = NamedTextColor.RED
    }
}
