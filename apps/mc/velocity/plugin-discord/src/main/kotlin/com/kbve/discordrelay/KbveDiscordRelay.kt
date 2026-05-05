package com.kbve.discordrelay

import com.google.inject.Inject
import com.velocitypowered.api.event.Subscribe
import com.velocitypowered.api.event.player.PlayerChatEvent
import com.velocitypowered.api.event.proxy.ProxyInitializeEvent
import com.velocitypowered.api.event.proxy.ProxyShutdownEvent
import com.velocitypowered.api.plugin.Plugin
import com.velocitypowered.api.proxy.ProxyServer
import org.slf4j.Logger

/**
 * KBVE Discord Relay
 * ==================
 *
 * Standalone Velocity plugin that mirrors all in-game chat into a single
 * Discord channel and routes Discord messages back into the network.
 *
 * Sibling to kbve-velocity-commands (teleport + chat bridge + last-server
 * persistence). The two ship side-by-side in the same Velocity image but
 * are independently versioned and have no source-level dependency on
 * each other — this plugin attaches its own PlayerChatEvent listener.
 *
 * Configuration (env vars):
 *   - DISCORD_BOT_TOKEN   : required; JDA login token
 *   - DISCORD_CHANNEL_ID  : optional; defaults to [DEFAULT_DISCORD_CHANNEL_ID]
 *   - DISCORD_CMD_ROLES   : optional CSV; defaults to [DEFAULT_AUTHORIZED_ROLES]
 *
 * If DISCORD_BOT_TOKEN is unset the plugin logs once and stays inert —
 * useful for the e2e container test where no bot exists.
 */
@Plugin(
    id = "kbve-discord-relay",
    name = "KBVE Discord Relay",
    version = "1.0.2",
    description = "Discord chat relay with prefix routing, reply context, and role-gated console commands.",
    authors = ["kbve"],
)
class KbveDiscordRelay @Inject constructor(
    private val server: ProxyServer,
    private val logger: Logger,
) {

    private var bot: DiscordBot? = null

    /**
     * Server-name aliases used when parsing Discord prefixes (>lobby, >mc, ...).
     * Hardcoded for v1 to match the kbve-velocity-commands teleport aliases.
     */
    private val serverAliases: Map<String, String> = mapOf(
        "lobby" to "lobby",
        "hub" to "lobby",
        "mc" to "mc",
        "survival" to "mc",
    )

    @Subscribe
    fun onProxyInit(event: ProxyInitializeEvent) {
        val token = System.getenv("DISCORD_BOT_TOKEN")
        if (token.isNullOrBlank()) {
            logger.info("KBVE Discord Relay: DISCORD_BOT_TOKEN unset — plugin inert")
            return
        }
        val channelId = System.getenv("DISCORD_CHANNEL_ID")?.takeIf { it.isNotBlank() }
            ?: DEFAULT_DISCORD_CHANNEL_ID
        val rolesEnv = System.getenv("DISCORD_CMD_ROLES")
        val roles: Set<String> = if (!rolesEnv.isNullOrBlank()) {
            rolesEnv.split(',').map { it.trim() }.filter { it.isNotEmpty() }.toSet()
        } else {
            DEFAULT_AUTHORIZED_ROLES
        }

        logger.info("KBVE Discord Relay v1.0.2 initializing")
        val dispatcher = ChatDispatcher(server)
        val instance = DiscordBot(
            server = server,
            logger = logger,
            dispatcher = dispatcher,
            token = token,
            channelId = channelId,
            authorizedRoles = roles,
            serverAliases = serverAliases,
        )
        instance.start()
        bot = instance
    }

    @Subscribe
    fun onProxyShutdown(event: ProxyShutdownEvent) {
        bot?.shutdown()
    }

    /**
     * Mirror every player chat to Discord regardless of /chat local|global
     * mode. The [L]/[S] suffix on the webhook author tells Discord readers
     * which backend the message came from, and reply-routing depends on
     * every chat being relayable.
     */
    @Subscribe
    fun onPlayerChat(event: PlayerChatEvent) {
        val active = bot ?: return
        val sender = event.player
        val sourceServer = sender.currentServer.orElse(null) ?: return
        active.postOutbound(sourceServer.serverInfo.name, sender.username, event.message)
    }

    companion object {
        // Default Discord channel for the chat relay.
        private const val DEFAULT_DISCORD_CHANNEL_ID = "1501071171804991651"

        // Roles allowed to invoke staff-gated commands (>cmd, >kick, ...).
        private val DEFAULT_AUTHORIZED_ROLES: Set<String> = setOf(
            "733334418747555918",
            "647866541790068746",
        )
    }
}
