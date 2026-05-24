package com.kbve.mcuplink

import org.bukkit.Bukkit
import org.bukkit.Material
import org.bukkit.configuration.file.YamlConfiguration
import org.bukkit.plugin.Plugin
import java.io.File

data class PortalRegion(
    val name: String,
    val world: String,
    val minX: Int,
    val minY: Int,
    val minZ: Int,
    val maxX: Int,
    val maxY: Int,
    val maxZ: Int,
    val targetServer: String,
    val triggerBlock: Material?,
) {
    fun contains(world: String, x: Int, y: Int, z: Int): Boolean =
        world == this.world &&
            x in minX..maxX &&
            y in minY..maxY &&
            z in minZ..maxZ
}

object Portals {

    const val CONFIG_FILE = "portals.yml"
    const val BUNGEE_CHANNEL = "BungeeCord"

    fun load(plugin: Plugin): List<PortalRegion> {
        val dataDir: File = plugin.dataFolder.apply { mkdirs() }
        val file = File(dataDir, CONFIG_FILE)
        if (!file.exists()) {
            plugin.saveResource(CONFIG_FILE, false)
        }
        val yaml = YamlConfiguration.loadConfiguration(file)
        val portalsSection = yaml.getConfigurationSection("portals") ?: return emptyList()
        return portalsSection.getKeys(false).mapNotNull { name ->
            val section = portalsSection.getConfigurationSection(name) ?: return@mapNotNull null
            val world = section.getString("world") ?: return@mapNotNull null
            val target = section.getString("target") ?: return@mapNotNull null
            val min = section.getIntegerList("min").takeIf { it.size == 3 } ?: return@mapNotNull null
            val max = section.getIntegerList("max").takeIf { it.size == 3 } ?: return@mapNotNull null
            val trigger = section.getString("trigger_block")?.let {
                Material.matchMaterial(it) ?: run {
                    plugin.logger.warning("kbve-mc-uplink: portal '$name' has unknown trigger_block '$it', ignoring filter")
                    null
                }
            }
            PortalRegion(
                name = name,
                world = world,
                minX = minOf(min[0], max[0]),
                minY = minOf(min[1], max[1]),
                minZ = minOf(min[2], max[2]),
                maxX = maxOf(min[0], max[0]),
                maxY = maxOf(min[1], max[1]),
                maxZ = maxOf(min[2], max[2]),
                targetServer = target,
                triggerBlock = trigger,
            )
        }
    }
}
