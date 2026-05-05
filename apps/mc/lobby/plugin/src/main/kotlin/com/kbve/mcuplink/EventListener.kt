package com.kbve.mcuplink

import io.papermc.paper.advancement.AdvancementDisplay
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer
import org.bukkit.event.EventHandler
import org.bukkit.event.Listener
import org.bukkit.event.entity.PlayerDeathEvent
import org.bukkit.event.player.PlayerAdvancementDoneEvent
import org.bukkit.plugin.Plugin

/**
 * Listens to gameplay events and forwards them upstream to the
 * Velocity-side relay over the kbve:relay-events channel.
 *
 * Filters:
 *  - Recipe advancements (`recipes/...`) are skipped — they're spammy
 *    and not real achievements.
 *  - Advancements without an `AdvancementDisplay` (root containers like
 *    `minecraft:adventure` itself) are skipped.
 *  - Advancements that don't announce-to-chat in vanilla are skipped
 *    (matches the in-game broadcast behavior).
 */
class EventListener(private val plugin: Plugin) : Listener {

    @EventHandler
    fun onPlayerDeath(event: PlayerDeathEvent) {
        val player = event.entity
        val msg = PlainTextComponentSerializer.plainText().serialize(
            event.deathMessage() ?: return
        )
        if (msg.isBlank()) return
        player.sendPluginMessage(
            plugin,
            RelayWire.CHANNEL,
            RelayWire.deathPayload(player.uniqueId.toString(), player.name, msg),
        )
    }

    @EventHandler
    fun onPlayerAdvancement(event: PlayerAdvancementDoneEvent) {
        val player = event.player
        val advancement = event.advancement
        val key = advancement.key.asString()
        if (advancement.key.key.startsWith("recipes/")) return
        val display: AdvancementDisplay = advancement.display ?: return
        if (!display.doesAnnounceToChat()) return
        val title = PlainTextComponentSerializer.plainText().serialize(display.title())
        player.sendPluginMessage(
            plugin,
            RelayWire.CHANNEL,
            RelayWire.advancementPayload(player.uniqueId.toString(), player.name, title, key),
        )
    }
}
