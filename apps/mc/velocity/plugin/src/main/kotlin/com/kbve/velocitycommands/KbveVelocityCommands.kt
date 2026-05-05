package com.kbve.velocitycommands

import com.google.inject.Inject
import com.mojang.brigadier.builder.LiteralArgumentBuilder
import com.velocitypowered.api.command.BrigadierCommand
import com.velocitypowered.api.command.CommandSource
import com.velocitypowered.api.event.Subscribe
import com.velocitypowered.api.event.connection.PostLoginEvent
import com.velocitypowered.api.event.connection.DisconnectEvent
import com.velocitypowered.api.event.player.PlayerChatEvent
import com.velocitypowered.api.event.player.PlayerChooseInitialServerEvent
import com.velocitypowered.api.event.player.ServerConnectedEvent
import com.velocitypowered.api.event.proxy.ProxyInitializeEvent
import com.velocitypowered.api.plugin.Plugin
import com.velocitypowered.api.plugin.annotation.DataDirectory
import com.velocitypowered.api.proxy.Player
import com.velocitypowered.api.proxy.ProxyServer
import com.velocitypowered.api.proxy.server.RegisteredServer
import net.kyori.adventure.text.Component
import net.kyori.adventure.text.format.NamedTextColor
import org.slf4j.Logger
import java.nio.file.Path
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * KBVE Velocity Commands
 * ======================
 *
 * Custom Velocity plugin for the KBVE MC stack (lobby + fabric survival):
 *
 *  1. Teleport command aliases — /lobby /hub /mc /survival.
 *  2. Cross-server chat bridge with /chat local|global per-player mode.
 *  3. Last-server persistence (reconnect lands on previous backend).
 *
 * Discord relay lives in a separate plugin (kbve-discord-relay) so the
 * two can be enabled, versioned, and rolled back independently.
 *
 * All storage is in-memory. On Velocity pod restart the chat modes and
 * last-server map reset to defaults — persistence is v2 scope.
 */
@Plugin(
    id = "kbve-velocity-commands",
    name = "KBVE Velocity Commands",
    version = "1.1.1",
    description = "Teleport aliases, cross-server chat bridge, and last-server persistence.",
    authors = ["kbve"],
)
class KbveVelocityCommands @Inject constructor(
    private val server: ProxyServer,
    private val logger: Logger,
    @DataDirectory private val dataDirectory: Path,
) {

    enum class ChatMode { LOCAL, GLOBAL }

    /** Per-player chat mode. Missing entry = GLOBAL (the default). */
    private val chatModes = ConcurrentHashMap<UUID, ChatMode>()

    /** Per-player last-connected server name. Missing entry = no override. */
    private val lastServers = ConcurrentHashMap<UUID, String>()

    /**
     * Alias → backing server name. Edit this map to add more aliases.
     * v1 hardcodes lobby/hub → "lobby", mc/survival → "mc".
     */
    private val teleportAliases: Map<String, String> = mapOf(
        "lobby" to "lobby",
        "hub" to "lobby",
        "mc" to "mc",
        "survival" to "mc",
    )

    @Subscribe
    fun onProxyInit(event: ProxyInitializeEvent) {
        logger.info("KBVE Velocity Commands v1.1.1 initializing")
        registerTeleportCommands()
        registerChatCommand()
        logger.info("Registered ${teleportAliases.size} teleport aliases + /chat command")
    }

    private fun registerTeleportCommands() {
        for ((alias, targetServerName) in teleportAliases) {
            val node = LiteralArgumentBuilder
                .literal<CommandSource>(alias)
                .executes { ctx ->
                    val source = ctx.source
                    if (source !is Player) {
                        source.sendMessage(
                            Component.text("This command can only be run by a player.")
                                .color(NamedTextColor.RED)
                        )
                        return@executes 0
                    }

                    val target: RegisteredServer? = server.getServer(targetServerName).orElse(null)
                    if (target == null) {
                        source.sendMessage(
                            Component.text("Server '$targetServerName' is not registered.")
                                .color(NamedTextColor.RED)
                        )
                        return@executes 0
                    }

                    val currentServer = source.currentServer.orElse(null)
                    if (currentServer != null && currentServer.serverInfo.name == targetServerName) {
                        source.sendMessage(
                            Component.text("You are already on $targetServerName.")
                                .color(NamedTextColor.GRAY)
                        )
                        return@executes 0
                    }

                    source.createConnectionRequest(target).fireAndForget()
                    1
                }
                .build()

            server.commandManager.register(
                server.commandManager.metaBuilder(alias)
                    .plugin(this)
                    .build(),
                BrigadierCommand(node)
            )
        }
    }

    private fun registerChatCommand() {
        val node = LiteralArgumentBuilder
            .literal<CommandSource>("chat")
            .executes { ctx ->
                val source = ctx.source as? Player ?: return@executes 0
                val mode = getChatMode(source.uniqueId)
                source.sendMessage(
                    Component.text("Current chat mode: ${mode.name.lowercase()}")
                        .color(NamedTextColor.AQUA)
                )
                1
            }
            .then(
                LiteralArgumentBuilder.literal<CommandSource>("local")
                    .executes { ctx ->
                        val source = ctx.source as? Player ?: return@executes 0
                        chatModes[source.uniqueId] = ChatMode.LOCAL
                        source.sendMessage(
                            Component.text("Chat set to local. Only players on your current server see your messages.")
                                .color(NamedTextColor.GRAY)
                        )
                        1
                    }
            )
            .then(
                LiteralArgumentBuilder.literal<CommandSource>("global")
                    .executes { ctx ->
                        val source = ctx.source as? Player ?: return@executes 0
                        chatModes[source.uniqueId] = ChatMode.GLOBAL
                        source.sendMessage(
                            Component.text("Chat set to global. Your messages broadcast to all servers.")
                                .color(NamedTextColor.GOLD)
                        )
                        1
                    }
            )
            .build()

        server.commandManager.register(
            server.commandManager.metaBuilder("chat")
                .plugin(this)
                .build(),
            BrigadierCommand(node)
        )
    }

    private fun getChatMode(uuid: UUID): ChatMode =
        chatModes.getOrDefault(uuid, ChatMode.GLOBAL)

    @Subscribe
    fun onPlayerChat(event: PlayerChatEvent) {
        val sender = event.player
        val mode = getChatMode(sender.uniqueId)
        if (mode == ChatMode.LOCAL) return

        val sourceServer = sender.currentServer.orElse(null) ?: return
        val sourceName = sourceServer.serverInfo.name

        val displayLabel = when (sourceName) {
            "lobby" -> "Lobby"
            "mc" -> "Survival"
            else -> sourceName.replaceFirstChar { it.uppercase() }
        }
        val labelColor = when (sourceName) {
            "lobby" -> NamedTextColor.DARK_AQUA
            "mc" -> NamedTextColor.DARK_GREEN
            else -> NamedTextColor.GRAY
        }

        // Cross-server bridge ONLY. Source-server players see the original signed
        // chat through the normal backend path — we never deny() the event because
        // 1.19.1+ disconnects the player if a plugin tries to cancel signed chat
        // (Velocity throws "A plugin tried to cancel a signed chat message").
        // Format on remote servers: [Lobby] fudster: hi
        //   - brackets + colon in dark gray
        //   - server label in DARK_AQUA / DARK_GREEN (no yellow)
        //   - player name + body in white
        val bridged = Component.text()
            .append(Component.text("[", NamedTextColor.DARK_GRAY))
            .append(Component.text(displayLabel, labelColor))
            .append(Component.text("] ", NamedTextColor.DARK_GRAY))
            .append(Component.text(sender.username, NamedTextColor.WHITE))
            .append(Component.text(": ", NamedTextColor.DARK_GRAY))
            .append(Component.text(event.message, NamedTextColor.WHITE))
            .build()

        for (target in server.allPlayers) {
            val targetServer = target.currentServer.orElse(null) ?: continue
            // Skip players on the same server — they already see the original
            // signed chat from the backend; sending the bridge component would
            // duplicate the message for them.
            if (targetServer.serverInfo.name == sourceName) continue
            target.sendMessage(bridged)
        }
    }

    @Subscribe
    fun onServerConnected(event: ServerConnectedEvent) {
        lastServers[event.player.uniqueId] = event.server.serverInfo.name
    }

    @Subscribe
    fun onPlayerChooseInitialServer(event: PlayerChooseInitialServerEvent) {
        val stored = lastServers[event.player.uniqueId] ?: return
        val registered = server.getServer(stored).orElse(null) ?: return
        event.setInitialServer(registered)
    }

    @Subscribe
    fun onPostLogin(event: PostLoginEvent) {
        // No-op today — placeholder in case we want to send a welcome
        // message or restore /chat mode from persistent storage in v2.
    }

    @Subscribe
    fun onDisconnect(event: DisconnectEvent) {
        // Keep chatModes + lastServers populated after disconnect so
        // the per-player preferences survive short reconnects. They
        // are cleared only on Velocity pod restart (in-memory map).
    }
}
