package com.kbve.mcuplink

import org.bukkit.plugin.java.JavaPlugin

/**
 * KBVE MC Uplink — Paper edition
 *
 * Forwards backend gameplay events (death, advancement) to the
 * Velocity-side `kbve-discord-relay` plugin over the `kbve:relay-events`
 * plugin-messaging channel. The relay owns the Discord webhook;
 * this plugin holds no Discord credentials and makes no HTTP calls.
 *
 * Channel is registered as both OUTGOING (death + advancement events)
 * and INCOMING (Discord-issued backend commands via the `>cmd lobby ...`
 * verb — see [ExecListener]).
 */
class KbveMcUplinkPlugin : JavaPlugin() {

    override fun onEnable() {
        server.messenger.registerOutgoingPluginChannel(this, RelayWire.CHANNEL)
        server.messenger.registerIncomingPluginChannel(this, RelayWire.CHANNEL, ExecListener(this))
        server.pluginManager.registerEvents(EventListener(this), this)

        val regions = Portals.load(this)
        if (regions.isNotEmpty()) {
            server.messenger.registerOutgoingPluginChannel(this, Portals.BUNGEE_CHANNEL)
            server.pluginManager.registerEvents(PortalListener(this, regions), this)
            logger.info("kbve-mc-uplink portals: ${regions.joinToString { "${it.name}→${it.targetServer}" }}")
        }
        logger.info("kbve-mc-uplink ${pluginMeta.version} ready (channel=${RelayWire.CHANNEL})")
    }

    override fun onDisable() {
        server.messenger.unregisterIncomingPluginChannel(this)
        server.messenger.unregisterOutgoingPluginChannel(this)
    }
}
