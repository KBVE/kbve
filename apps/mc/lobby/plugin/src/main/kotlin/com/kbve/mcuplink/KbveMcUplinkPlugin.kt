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
 * Channel registration is OUTGOING only — backends emit, the proxy
 * receives and consumes.
 */
class KbveMcUplinkPlugin : JavaPlugin() {

    override fun onEnable() {
        server.messenger.registerOutgoingPluginChannel(this, RelayWire.CHANNEL)
        server.pluginManager.registerEvents(EventListener(this), this)
        logger.info("kbve-mc-uplink ${pluginMeta.version} ready (channel=${RelayWire.CHANNEL})")
    }

    override fun onDisable() {
        server.messenger.unregisterOutgoingPluginChannel(this)
    }
}
