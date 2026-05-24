package com.kbve.mcuplink

import org.bukkit.event.EventHandler
import org.bukkit.event.EventPriority
import org.bukkit.event.Listener
import org.bukkit.event.player.PlayerMoveEvent
import org.bukkit.event.player.PlayerTeleportEvent
import org.bukkit.plugin.Plugin
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.util.UUID

class PortalListener(
    private val plugin: Plugin,
    private val regions: List<PortalRegion>,
    private val cooldownMillis: Long = 3_000L,
) : Listener {

    private val lastTrigger = HashMap<UUID, Long>()

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    fun onMove(event: PlayerMoveEvent) {
        val from = event.from
        val to = event.to
        if (from.blockX == to.blockX && from.blockY == to.blockY && from.blockZ == to.blockZ) return
        maybeTransfer(event.player, to.world.name, to.blockX, to.blockY, to.blockZ)
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    fun onTeleport(event: PlayerTeleportEvent) {
        val to = event.to ?: return
        maybeTransfer(event.player, to.world.name, to.blockX, to.blockY, to.blockZ)
    }

    private fun maybeTransfer(player: org.bukkit.entity.Player, world: String, x: Int, y: Int, z: Int) {
        val region = regions.firstOrNull { it.contains(world, x, y, z) } ?: return
        val trigger = region.triggerBlock
        if (trigger != null) {
            val block = player.world.getBlockAt(x, y, z)
            if (block.type != trigger) return
        }
        val now = System.currentTimeMillis()
        val last = lastTrigger[player.uniqueId]
        if (last != null && now - last < cooldownMillis) return
        lastTrigger[player.uniqueId] = now
        sendConnect(player, region.targetServer)
        plugin.logger.info("kbve-mc-uplink: portal '${region.name}' fired for ${player.name} → ${region.targetServer}")
    }

    private fun sendConnect(player: org.bukkit.entity.Player, target: String) {
        val baos = ByteArrayOutputStream()
        DataOutputStream(baos).use {
            it.writeUTF("Connect")
            it.writeUTF(target)
        }
        player.sendPluginMessage(plugin, Portals.BUNGEE_CHANNEL, baos.toByteArray())
    }
}
