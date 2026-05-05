package com.kbve.discordrelay

import com.velocitypowered.api.proxy.ProxyServer
import net.dv8tion.jda.api.EmbedBuilder
import net.dv8tion.jda.api.JDA
import net.dv8tion.jda.api.JDABuilder
import net.dv8tion.jda.api.entities.Member
import net.dv8tion.jda.api.entities.Message
import net.dv8tion.jda.api.entities.Webhook
import net.dv8tion.jda.api.entities.channel.concrete.TextChannel
import net.dv8tion.jda.api.events.message.MessageReceivedEvent
import net.dv8tion.jda.api.events.session.ReadyEvent
import net.dv8tion.jda.api.exceptions.PermissionException
import net.dv8tion.jda.api.hooks.ListenerAdapter
import net.dv8tion.jda.api.requests.GatewayIntent
import net.dv8tion.jda.api.utils.MemberCachePolicy
import net.dv8tion.jda.api.utils.cache.CacheFlag
import net.kyori.adventure.text.Component
import org.slf4j.Logger
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.util.concurrent.atomic.AtomicReference

/**
 * JDA-backed Discord ↔ Velocity chat bridge.
 *
 * Outbound: [postOutbound] posts as the player's name via a webhook the
 * bot self-provisions on the configured channel ("kbve-mc-relay").
 *
 * Inbound: listens to MessageReceivedEvent on one channel and parses
 * prefix routing (>lobby, >mc, >cmd, >who, ...) — plain text broadcasts
 * globally, replies inherit the source server from the referenced
 * webhook message's author tag ("Player [L]" / "Player [S]").
 *
 * Auth: STAFF commands check member roles against [authorizedRoles].
 * Unauthorized callers are silently dropped (no reply, no reaction)
 * so they can't enumerate the gated command set.
 */
class DiscordBot(
    private val server: ProxyServer,
    private val logger: Logger,
    private val dispatcher: ChatDispatcher,
    private val token: String,
    private val channelId: String,
    private val authorizedRoles: Set<String>,
    private val serverAliases: Map<String, String>,
) : ListenerAdapter() {

    private var jda: JDA? = null
    private val webhookUrl = AtomicReference<String?>(null)
    private val httpClient: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .build()

    @Volatile private var botUserId: String? = null

    fun start() {
        logger.info("DiscordBot starting (channel={}, authorizedRoles={})", channelId, authorizedRoles)
        try {
            jda = JDABuilder.createDefault(token)
                .enableIntents(GatewayIntent.GUILD_MESSAGES, GatewayIntent.MESSAGE_CONTENT, GatewayIntent.GUILD_MEMBERS)
                .setMemberCachePolicy(MemberCachePolicy.ALL)
                .disableCache(CacheFlag.VOICE_STATE, CacheFlag.EMOJI, CacheFlag.STICKER, CacheFlag.SCHEDULED_EVENTS, CacheFlag.ACTIVITY)
                .addEventListeners(this)
                .build()
        } catch (t: Throwable) {
            logger.error("DiscordBot failed to start JDA — relay disabled", t)
        }
    }

    fun shutdown() {
        try {
            jda?.shutdown()
            logger.info("DiscordBot shutdown")
        } catch (t: Throwable) {
            logger.warn("DiscordBot shutdown error", t)
        }
    }

    /**
     * Post a player's chat to Discord via the cached webhook.
     * Webhook username is set to "<player> [L|S|?]" so reply-routing can
     * recover the source server from the message's author name.
     */
    fun postOutbound(serverName: String, playerName: String, message: String) {
        val url = webhookUrl.get() ?: return
        val tag = serverTag(serverName)
        val displayName = sanitizeUsername("$playerName $tag")
        val payload = JsonWriter.obj()
            .field("username", displayName)
            .field("content", message)
            .field("allowed_mentions", JsonWriter.obj().field("parse", JsonWriter.arr()))
            .build()

        val req = HttpRequest.newBuilder(URI.create(url))
            .timeout(Duration.ofSeconds(5))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(payload, StandardCharsets.UTF_8))
            .build()

        httpClient.sendAsync(req, HttpResponse.BodyHandlers.discarding())
            .whenComplete { resp, err ->
                if (err != null) {
                    logger.warn("Discord webhook POST failed", err)
                } else if (resp.statusCode() !in 200..299) {
                    logger.warn("Discord webhook POST returned {}", resp.statusCode())
                }
            }
    }

    override fun onReady(event: ReadyEvent) {
        botUserId = event.jda.selfUser.id
        logger.info("DiscordBot JDA ready as {} ({})", event.jda.selfUser.name, botUserId)

        val channel = event.jda.getTextChannelById(channelId)
        if (channel == null) {
            logger.error("Configured channel {} not found — bot is not in the guild or channel ID is wrong", channelId)
            return
        }
        provisionWebhook(channel)
    }

    private fun provisionWebhook(channel: TextChannel) {
        try {
            channel.retrieveWebhooks().queue({ existing ->
                val match = existing.firstOrNull { it.name == WEBHOOK_NAME }
                if (match != null) {
                    webhookUrl.set(match.url)
                    logger.info("Reusing existing webhook {} on #{}", WEBHOOK_NAME, channel.name)
                } else {
                    channel.createWebhook(WEBHOOK_NAME).queue({ created: Webhook ->
                        webhookUrl.set(created.url)
                        logger.info("Created webhook {} on #{}", WEBHOOK_NAME, channel.name)
                    }, { err ->
                        logger.error("Failed to create webhook (need MANAGE_WEBHOOKS) — outbound disabled", err)
                    })
                }
            }, { err ->
                if (err is PermissionException) {
                    logger.error("Bot lacks MANAGE_WEBHOOKS on #{} — outbound disabled", channel.name)
                } else {
                    logger.error("retrieveWebhooks failed", err)
                }
            })
        } catch (t: Throwable) {
            logger.error("provisionWebhook error", t)
        }
    }

    override fun onMessageReceived(event: MessageReceivedEvent) {
        if (event.channel.id != channelId) return
        if (event.author.isBot) return
        if (event.author.id == botUserId) return

        // contentDisplay resolves <@id> -> @username, <@&id> -> @RoleName, <#id> -> #channel.
        // contentRaw would leak the numeric IDs into in-game chat. Prefix detection is
        // unaffected because >foo prefixes don't involve mention syntax.
        val raw = event.message.contentDisplay.trim()
        if (raw.isEmpty()) return

        val member = event.member
        val displayName = member?.effectiveName ?: event.author.name

        val prefixMatch = PREFIX_REGEX.matchEntire(raw)
        if (prefixMatch != null) {
            val token = prefixMatch.groupValues[1].lowercase()
            val rest = prefixMatch.groupValues[2]
            handlePrefix(event, member, displayName, token, rest)
            return
        }

        val replyServer = inferServerFromReply(event.message)
        if (replyServer != null) {
            relayChatToServer(replyServer, displayName, raw)
        } else {
            relayChatGlobal(displayName, raw)
        }
    }

    private fun handlePrefix(
        event: MessageReceivedEvent,
        member: Member?,
        displayName: String,
        token: String,
        rest: String,
    ) {
        when (token) {
            "who", "list" -> handleWho(event)
            "servers" -> handleServers(event)
            "help" -> handleHelp(event, member)

            "cmd" -> handleCmd(event, member, rest)
            "kick" -> handleStaffPassthrough(event, member, "kick", rest)
            "ban" -> handleStaffPassthrough(event, member, "ban", rest)
            "mute" -> handleStaffPassthrough(event, member, "mute", rest)
            "tell" -> handleTell(event, member, displayName, rest)
            "say" -> handleSay(event, member, rest)

            else -> {
                val backendName = serverAliases[token]
                if (backendName != null) {
                    relayChatToServer(backendName, displayName, rest)
                } else {
                    relayChatGlobal(displayName, ">$token $rest")
                }
            }
        }
    }

    private fun relayChatGlobal(discordName: String, message: String) {
        val component = Component.text("[D] <$discordName> $message")
            .color(ChatDispatcher.COLOR_DISCORD_GLOBAL)
        dispatcher.broadcastGlobal(component)
    }

    private fun relayChatToServer(serverName: String, discordName: String, message: String) {
        val tag = when (serverName) {
            "lobby" -> "L"
            "mc" -> "S"
            else -> "?"
        }
        val color = when (serverName) {
            "lobby" -> ChatDispatcher.COLOR_DISCORD_LOBBY
            "mc" -> ChatDispatcher.COLOR_DISCORD_SURVIVAL
            else -> ChatDispatcher.COLOR_DISCORD_GLOBAL
        }
        val component = Component.text("[D→$tag] <$discordName> $message").color(color)
        dispatcher.broadcastToServer(serverName, component)
    }

    private fun inferServerFromReply(message: Message): String? {
        val ref = message.referencedMessage ?: return null
        val authorName = ref.author.name
        val match = AUTHOR_TAG_REGEX.find(authorName) ?: return null
        return when (match.groupValues[1]) {
            "L" -> "lobby"
            "S" -> "mc"
            else -> null
        }
    }

    private fun handleWho(event: MessageReceivedEvent) {
        val grouped = server.allPlayers.groupBy {
            it.currentServer.map { cs -> cs.serverInfo.name }.orElse("?")
        }
        val total = server.allPlayers.size
        val embed = EmbedBuilder()
            .setTitle("Online players: $total")
            .setColor(0x00BCD4)
        if (grouped.isEmpty()) {
            embed.setDescription("Nobody online.")
        } else {
            for ((srv, players) in grouped.toSortedMap()) {
                val names = players.joinToString(", ") { it.username }
                embed.addField("$srv (${players.size})", names.ifEmpty { "—" }, false)
            }
        }
        event.channel.sendMessageEmbeds(embed.build()).queue()
    }

    private fun handleServers(event: MessageReceivedEvent) {
        val embed = EmbedBuilder()
            .setTitle("Backends")
            .setColor(0x4CAF50)
        for (rs in server.allServers) {
            val name = rs.serverInfo.name
            val playerCount = rs.playersConnected.size
            embed.addField(name, "Players: $playerCount\nAddress: ${rs.serverInfo.address}", true)
        }
        event.channel.sendMessageEmbeds(embed.build()).queue()
    }

    private fun handleHelp(event: MessageReceivedEvent, member: Member?) {
        val isStaff = isStaff(member)
        val embed = EmbedBuilder()
            .setTitle("Available commands")
            .setColor(0x9C27B0)

        val publicLines = listOf(
            "**plain text** — global chat to all servers",
            "**>lobby <msg>** / **>hub <msg>** — chat scoped to lobby",
            "**>mc <msg>** / **>survival <msg>** — chat scoped to survival",
            "**reply to a message** — chat scoped to that message's source server",
            "**>who** / **>list** — list online players",
            "**>servers** — list backend servers",
            "**>help** — this message",
        )
        embed.addField("Public", publicLines.joinToString("\n"), false)

        if (isStaff) {
            val staffLines = listOf(
                "**>cmd <command>** — run a command on the Velocity console",
                "**>kick <player> [reason]** — kick a player",
                "**>ban <player> [reason]** — ban a player (requires backend ban plugin)",
                "**>mute <player> [duration]** — mute a player (requires backend mute plugin)",
                "**>tell <player> <msg>** — DM a player from Discord",
                "**>say <msg>** — broadcast as staff announcement",
            )
            embed.addField("Staff", staffLines.joinToString("\n"), false)
        }
        event.channel.sendMessageEmbeds(embed.build()).queue()
    }

    private fun isStaff(member: Member?): Boolean {
        if (member == null) return false
        return member.roles.any { it.id in authorizedRoles }
    }

    /**
     * Returns true if authorized. On rejection, audit-logs and silently
     * drops — no reaction, no reply (don't advertise the gated command).
     */
    private fun requireStaff(event: MessageReceivedEvent, member: Member?, command: String): Boolean {
        if (isStaff(member)) {
            logger.info(
                "discord-cmd accept user={} ({}) cmd={}",
                event.author.id, event.author.name, command,
            )
            return true
        }
        logger.info(
            "discord-cmd reject user={} ({}) cmd={} reason=missing_role",
            event.author.id, event.author.name, command,
        )
        return false
    }

    private fun handleCmd(event: MessageReceivedEvent, member: Member?, body: String) {
        if (!requireStaff(event, member, ">cmd $body")) return
        if (body.isBlank()) {
            event.message.addReaction(net.dv8tion.jda.api.entities.emoji.Emoji.fromUnicode("⚠️")).queue()
            return
        }
        executeConsole(event, body)
    }

    private fun handleStaffPassthrough(
        event: MessageReceivedEvent,
        member: Member?,
        verb: String,
        rest: String,
    ) {
        if (!requireStaff(event, member, ">$verb $rest")) return
        if (rest.isBlank()) {
            event.message.addReaction(net.dv8tion.jda.api.entities.emoji.Emoji.fromUnicode("⚠️")).queue()
            return
        }
        executeConsole(event, "$verb $rest")
    }

    private fun handleTell(event: MessageReceivedEvent, member: Member?, displayName: String, rest: String) {
        if (!requireStaff(event, member, ">tell $rest")) return
        val parts = rest.split(' ', limit = 2)
        if (parts.size < 2 || parts[0].isBlank() || parts[1].isBlank()) {
            event.message.addReaction(net.dv8tion.jda.api.entities.emoji.Emoji.fromUnicode("⚠️")).queue()
            return
        }
        val targetName = parts[0]
        val msg = parts[1]
        val component = Component.text("[Discord→DM from $displayName] $msg")
            .color(ChatDispatcher.COLOR_DISCORD_DM)
        val found = dispatcher.sendToPlayer(targetName, component)
        val emoji = if (found) "✅" else "❌"
        event.message.addReaction(net.dv8tion.jda.api.entities.emoji.Emoji.fromUnicode(emoji)).queue()
    }

    private fun handleSay(event: MessageReceivedEvent, member: Member?, rest: String) {
        if (!requireStaff(event, member, ">say $rest")) return
        if (rest.isBlank()) {
            event.message.addReaction(net.dv8tion.jda.api.entities.emoji.Emoji.fromUnicode("⚠️")).queue()
            return
        }
        val component = Component.text("[Discord Staff] $rest")
            .color(ChatDispatcher.COLOR_DISCORD_STAFF_SAY)
        dispatcher.broadcastGlobal(component)
        event.message.addReaction(net.dv8tion.jda.api.entities.emoji.Emoji.fromUnicode("✅")).queue()
    }

    private fun executeConsole(event: MessageReceivedEvent, command: String) {
        try {
            server.commandManager
                .executeAsync(server.consoleCommandSource, command)
                .whenComplete { ok, err ->
                    val emoji = when {
                        err != null -> "⚠️"
                        ok == true -> "✅"
                        else -> "❌"
                    }
                    event.message.addReaction(net.dv8tion.jda.api.entities.emoji.Emoji.fromUnicode(emoji)).queue()
                    if (err != null) {
                        val msg = (err.message ?: err::class.java.simpleName).take(1500)
                        event.channel.sendMessage("```\n$msg\n```").queue()
                        logger.warn("Console command error: {}", command, err)
                    }
                }
        } catch (t: Throwable) {
            event.message.addReaction(net.dv8tion.jda.api.entities.emoji.Emoji.fromUnicode("⚠️")).queue()
            logger.warn("executeConsole threw", t)
        }
    }

    /** Discord usernames for webhook messages: 1-80 chars, no @, #, :, ```. */
    private fun sanitizeUsername(s: String): String =
        s.replace(Regex("[@#:`]"), "").take(80).ifBlank { "Player" }

    private fun serverTag(serverName: String): String = when (serverName) {
        "lobby" -> "[L]"
        "mc" -> "[S]"
        else -> "[?]"
    }

    companion object {
        const val WEBHOOK_NAME = "kbve-mc-relay"
        private val PREFIX_REGEX = Regex("""^>(\w+)\s+([\s\S]+)$""")
        private val AUTHOR_TAG_REGEX = Regex("""\[(L|S|\?)]\s*$""")
    }
}

/** Tiny zero-dep JSON object/array writer for the webhook payload. */
internal class JsonWriter private constructor(private val isArray: Boolean) {
    private val parts = mutableListOf<String>()

    fun field(name: String, value: String): JsonWriter {
        parts += "\"${escape(name)}\":\"${escape(value)}\""
        return this
    }

    fun field(name: String, value: JsonWriter): JsonWriter {
        parts += "\"${escape(name)}\":${value.build()}"
        return this
    }

    fun build(): String =
        if (isArray) parts.joinToString(",", "[", "]")
        else parts.joinToString(",", "{", "}")

    companion object {
        fun obj() = JsonWriter(false)
        fun arr() = JsonWriter(true)

        private fun escape(s: String): String = buildString(s.length + 2) {
            for (ch in s) when (ch) {
                '\\' -> append("\\\\")
                '"' -> append("\\\"")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                '\t' -> append("\\t")
                '\b' -> append("\\b")
                '\u000C' -> append("\\f")
                else -> if (ch.code < 0x20) append("\\u%04x".format(ch.code)) else append(ch)
            }
        }
    }
}
