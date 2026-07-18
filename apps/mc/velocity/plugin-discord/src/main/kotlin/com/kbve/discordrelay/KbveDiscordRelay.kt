package com.kbve.discordrelay

import com.google.inject.Inject
import com.velocitypowered.api.event.Subscribe
import com.velocitypowered.api.event.connection.DisconnectEvent
import com.velocitypowered.api.event.connection.PluginMessageEvent
import com.velocitypowered.api.event.player.PlayerChatEvent
import com.velocitypowered.api.event.player.ServerConnectedEvent
import com.velocitypowered.api.event.proxy.ProxyInitializeEvent
import com.velocitypowered.api.event.proxy.ProxyShutdownEvent
import com.velocitypowered.api.plugin.Plugin
import com.velocitypowered.api.proxy.ProxyServer
import com.velocitypowered.api.proxy.messages.MinecraftChannelIdentifier
import org.slf4j.Logger
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

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
 * Backend gameplay events (deaths, advancements) arrive via the
 * `kbve:relay-events` plugin-messaging channel — see [RelayEventChannel].
 *
 * Configuration (env vars):
 *   - DISCORD_BOT_TOKEN        : required; JDA login token
 *   - DISCORD_CHANNEL_ID       : optional; defaults to [DEFAULT_DISCORD_CHANNEL_ID]
 *   - DISCORD_CMD_ROLES        : optional CSV; defaults to [DEFAULT_AUTHORIZED_ROLES]
 *   - DISCORD_VOICE_CHANNEL_ID : optional; voice channel to idle in
 *                                (self-muted + self-deafened). Defaults to
 *                                [DEFAULT_VOICE_CHANNEL_ID]; set to 0/off/disabled
 *                                to turn the voice presence off.
 *
 * If DISCORD_BOT_TOKEN is unset the plugin logs once and stays inert —
 * useful for the e2e container test where no bot exists.
 */
@Plugin(
    id = "kbve-discord-relay",
    name = "KBVE Discord Relay",
    version = "1.2.0",
    description = "Discord chat relay with prefix routing, reply context, role-gated console commands, and backend event channel.",
    authors = ["kbve"],
)
class KbveDiscordRelay @Inject constructor(
    private val server: ProxyServer,
    private val logger: Logger,
) {

    private var bot: DiscordBot? = null
    private var relayChannel: RelayEventChannel? = null
    private var execRouter: ExecRouter? = null
    private var statusMonitor: BackendStatusMonitor? = null

    /**
     * Last server each player was connected to, keyed by UUID. Used by the
     * leave embed to render "left the Lobby" / "left the Survival" instead
     * of just "left the network". Updated on ServerConnectedEvent, read on
     * DisconnectEvent (which doesn't have currentServer at the moment of
     * disconnect).
     */
    private val lastServer = ConcurrentHashMap<UUID, String>()

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
        val voiceChannelId = (System.getenv("DISCORD_VOICE_CHANNEL_ID")?.trim()
            ?.takeIf { it.isNotBlank() } ?: DEFAULT_VOICE_CHANNEL_ID)
            .takeUnless { it.lowercase() in setOf("0", "off", "disabled") }

        logger.info("KBVE Discord Relay v1.2.0 initializing")
        val dispatcher = ChatDispatcher(server)

        // Register the kbve:relay-events plugin-messaging channel first so the
        // ExecRouter can use the same identifier when sending outbound exec
        // payloads.
        val channel = MinecraftChannelIdentifier.create(RELAY_CHANNEL_NAMESPACE, RELAY_CHANNEL_NAME)
        server.channelRegistrar.register(channel)
        val router = ExecRouter(server, logger, channel)
        execRouter = router

        val instance = DiscordBot(
            server = server,
            logger = logger,
            dispatcher = dispatcher,
            token = token,
            channelId = channelId,
            authorizedRoles = roles,
            serverAliases = serverAliases,
            execRouter = router,
            voiceChannelId = voiceChannelId,
        )
        instance.start()
        bot = instance

        relayChannel = RelayEventChannel(logger, instance, channel, router)
        logger.info("KBVE Discord Relay registered channel {}:{}", RELAY_CHANNEL_NAMESPACE, RELAY_CHANNEL_NAME)

        // Backend lifecycle tracking — pings each backend periodically and
        // posts an embed on up/down transitions.
        val monitor = BackendStatusMonitor(server, logger, instance)
        monitor.start()
        statusMonitor = monitor
    }

    @Subscribe
    fun onProxyShutdown(event: ProxyShutdownEvent) {
        // Fire the lifecycle embed BEFORE tearing down JDA so the HTTP POST
        // has a working webhook to call.
        bot?.announceShutdown()
        bot?.shutdown()
        execRouter?.shutdown()
        statusMonitor?.shutdown()
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
        active.postOutbound(sourceServer.serverInfo.name, sender.username, sender.uniqueId, event.message)
    }

    /**
     * Network join + server switch. ServerConnectedEvent fires when the player
     * lands on a backend; previousServer is empty on the very first connection
     * (= network join), populated on subsequent switches.
     */
    @Subscribe
    fun onServerConnected(event: ServerConnectedEvent) {
        val active = bot ?: return
        val player = event.player
        val target = event.server.serverInfo.name
        lastServer[player.uniqueId] = target
        val display = displayServerName(target)
        if (event.previousServer.isEmpty) {
            active.postSystemEmbed("${player.username} joined the $display", DiscordBot.COLOR_JOIN, player.uniqueId)
        } else {
            active.postSystemEmbed("${player.username} moved to $display", DiscordBot.COLOR_SWITCH, player.uniqueId)
        }
    }

    /** Network-level leave — fires when the player disconnects from the proxy. */
    @Subscribe
    fun onDisconnect(event: DisconnectEvent) {
        val active = bot ?: return
        val player = event.player
        val from = lastServer.remove(player.uniqueId)
        val text = if (from != null) {
            "${player.username} left the ${displayServerName(from)}"
        } else {
            "${player.username} left the network"
        }
        active.postSystemEmbed(text, DiscordBot.COLOR_LEAVE, player.uniqueId)
    }

    /** Forward backend plugin messages to the relay channel handler. */
    @Subscribe
    fun onPluginMessage(event: PluginMessageEvent) {
        relayChannel?.handle(event)
    }

    private fun displayServerName(name: String): String = when (name) {
        "lobby" -> "Lobby"
        "mc" -> "Survival"
        else -> name.replaceFirstChar { it.uppercase() }
    }

    companion object {
        // Default Discord channel for the chat relay.
        private const val DEFAULT_DISCORD_CHANNEL_ID = "1501071171804991651"

        // Default voice channel the bot idles in (self-muted + self-deafened).
        private const val DEFAULT_VOICE_CHANNEL_ID = "733345228471140445"

        // Roles allowed to invoke staff-gated commands (>cmd, >kick, ...).
        private val DEFAULT_AUTHORIZED_ROLES: Set<String> = setOf(
            "733334418747555918",
            "647866541790068746",
        )

        // Plugin-messaging channel for backend → relay event forwarding.
        // Backend plugins (kbve-mc-uplink) send length-prefixed UTF JSON
        // payloads describing deaths, advancements, etc.
        const val RELAY_CHANNEL_NAMESPACE = "kbve"
        const val RELAY_CHANNEL_NAME = "relay-events"
    }
}
