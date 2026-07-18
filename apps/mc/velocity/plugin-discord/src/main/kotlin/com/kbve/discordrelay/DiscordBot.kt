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
    private val execRouter: ExecRouter,
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
     * recover the source server from the message's author name. Avatar
     * rendered via Visage when a player UUID is supplied.
     */
    fun postOutbound(serverName: String, playerName: String, playerUuid: java.util.UUID?, message: String) {
        val tag = serverTag(serverName)
        val displayName = sanitizeUsername("$playerName $tag")
        postWebhook(displayName, message, playerUuid?.let(::visageUrl))
    }

    /**
     * Post a system event embed (join, leave, switch, death, advancement)
     * with the player's face icon as the embed author icon and a sidebar
     * color matching the event type. See companion [Color] for codes.
     */
    fun postSystemEmbed(authorText: String, color: Int, playerUuid: java.util.UUID?) {
        val url = webhookUrl.get() ?: return
        val author = JsonWriter.obj().field("name", authorText)
        if (playerUuid != null) {
            author.field("icon_url", visageUrl(playerUuid))
        }
        val embed = JsonWriter.obj()
            .fieldRaw("color", color.toString())
            .field("author", author)
        val payload = JsonWriter.obj()
            .field("embeds", JsonWriter.arr().element(embed))
            .field("allowed_mentions", JsonWriter.obj().field("parse", JsonWriter.arr()))
            .build()
        sendPayload(url, payload)
    }

    private fun postWebhook(username: String, content: String, avatarUrl: String? = null) {
        val url = webhookUrl.get() ?: return
        val builder = JsonWriter.obj()
            .field("username", username)
            .field("content", content)
            .field("allowed_mentions", JsonWriter.obj().field("parse", JsonWriter.arr()))
        if (avatarUrl != null) {
            builder.field("avatar_url", avatarUrl)
        }
        sendPayload(url, builder.build())
    }

    private fun sendPayload(url: String, payload: String) {
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

    private fun visageUrl(uuid: java.util.UUID): String =
        "https://visage.surgeplay.com/face/96/$uuid"

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
                    announceLifecycle("🟢 Proxy started", COLOR_JOIN)
                } else {
                    channel.createWebhook(WEBHOOK_NAME).queue({ created: Webhook ->
                        webhookUrl.set(created.url)
                        logger.info("Created webhook {} on #{}", WEBHOOK_NAME, channel.name)
                        announceLifecycle("🟢 Proxy started", COLOR_JOIN)
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

    /** Lifecycle embed — sidebar-only, no avatar (system event, not a player). */
    private fun announceLifecycle(text: String, color: Int) {
        postSystemEmbed(text, color, null)
    }

    /**
     * Synchronously post a shutdown embed before JDA tears down. Best-effort —
     * if the bot was never ready or the webhook isn't provisioned, no-op.
     * Blocks up to 2s on the HTTP send so the message has a chance to land.
     */
    fun announceShutdown() {
        val url = webhookUrl.get() ?: return
        val author = JsonWriter.obj().field("name", "🔴 Proxy shutting down")
        val embed = JsonWriter.obj()
            .fieldRaw("color", COLOR_LEAVE.toString())
            .field("author", author)
        val payload = JsonWriter.obj()
            .field("embeds", JsonWriter.arr().element(embed))
            .field("allowed_mentions", JsonWriter.obj().field("parse", JsonWriter.arr()))
            .build()
        val req = HttpRequest.newBuilder(URI.create(url))
            .timeout(Duration.ofSeconds(2))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(payload, StandardCharsets.UTF_8))
            .build()
        try {
            httpClient.send(req, HttpResponse.BodyHandlers.discarding())
        } catch (t: Throwable) {
            logger.warn("Failed to post shutdown embed", t)
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
            embed.addField(name, "Players: $playerCount", true)
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
                "**>cmd <proxy|lobby|mc> <command> [-v]** — run a command on the named target. Add `-v` to see output. Append `--` to pass a literal trailing `-v`.",
                "**>kick <player> [reason]** — kick a player (auto-routes to their backend)",
                "**>ban <player> [reason]** — ban a player (vanilla `/ban`, persists to `banned-players.json`)",
                "**>mute <player> [duration]** — mute a player (requires EssentialsX or similar — vanilla has no `/mute`)",
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
            reply(event, USAGE_CMD)
            return
        }
        // Strict target-required parsing: first token is target, rest is the
        // actual command. Trailing -v (peeled before forwarding) toggles verbose.
        val parts = body.split(' ', limit = 2)
        val targetToken = parts[0].lowercase()
        val rest = if (parts.size > 1) parts[1] else ""
        val target = CMD_TARGETS[targetToken]
        if (target == null) {
            reply(event, USAGE_CMD)
            return
        }
        if (rest.isBlank()) {
            reply(event, USAGE_CMD)
            return
        }
        val (command, verbose) = parseVerbose(rest)
        if (command.isBlank()) {
            reply(event, USAGE_CMD)
            return
        }
        if (target == "proxy") {
            executeOnProxy(event, command, verbose)
        } else {
            executeOnBackend(event, target, command, verbose)
        }
    }

    /**
     * Peel a trailing `-v` flag off the command. Supports POSIX-style `--`
     * end-of-options to escape: `say something -v --` runs `say something -v`
     * silently. Returns (command-without-flag, verboseRequested).
     */
    private fun parseVerbose(input: String): Pair<String, Boolean> {
        val tokens = input.trim().split(Regex("\\s+")).toMutableList()
        if (tokens.isEmpty()) return "" to false
        // End-of-options sentinel: drop trailing `--` AFTER any flags.
        if (tokens.last() == "--") {
            tokens.removeAt(tokens.size - 1)
            return tokens.joinToString(" ") to false
        }
        if (tokens.last() == "-v") {
            tokens.removeAt(tokens.size - 1)
            return tokens.joinToString(" ") to true
        }
        return input to false
    }

    private fun executeOnProxy(event: MessageReceivedEvent, command: String, verbose: Boolean) {
        val captureSource = BufferedConsoleSource(server.consoleCommandSource)
        try {
            server.commandManager
                .executeAsync(captureSource, command)
                .whenComplete { ok, err ->
                    val output = captureSource.captured
                    when {
                        err != null -> {
                            val msg = (err.message ?: err::class.java.simpleName).take(MAX_OUTPUT_CHARS)
                            reply(event, "⚠️ Error: ```\n$msg\n```")
                            logger.warn("Console command error: {}", command, err)
                        }
                        ok != true -> {
                            reply(event, "❌ unknown or rejected: `$command`\n$PROXY_HINT")
                        }
                        !verbose -> {
                            event.message.addReaction(
                                net.dv8tion.jda.api.entities.emoji.Emoji.fromUnicode("✅")
                            ).queue()
                        }
                        output.isBlank() -> reply(event, "✅ ran (no output)")
                        else -> reply(event, "✅\n```\n${output.take(MAX_OUTPUT_CHARS)}\n```")
                    }
                }
        } catch (t: Throwable) {
            reply(event, "⚠️ ${t.message ?: t::class.java.simpleName}")
            logger.warn("executeOnProxy threw", t)
        }
    }

    private fun executeOnBackend(
        event: MessageReceivedEvent,
        target: String,
        command: String,
        verbose: Boolean,
    ) {
        val sent = execRouter.executeOnBackend(target, command, verbose, event)
        if (!sent) {
            reply(event, "❌ no players on `$target` to route command through")
        }
    }

    private fun handleStaffPassthrough(
        event: MessageReceivedEvent,
        member: Member?,
        verb: String,
        rest: String,
    ) {
        if (!requireStaff(event, member, ">$verb $rest")) return
        if (rest.isBlank()) {
            reply(event, "Usage: `>$verb <player> [reason...]`")
            return
        }
        // Auto-detect: find the player on whichever backend they're connected
        // to, then forward the verb (kick / ban / mute) as a backend command.
        val (body, verbose) = parseVerbose(rest)
        val targetName = body.split(' ', limit = 2).firstOrNull()
            ?: run {
                reply(event, "Usage: `>$verb <player> [reason...]`")
                return
            }
        val targetPlayer = server.allPlayers.firstOrNull { it.username.equals(targetName, ignoreCase = true) }
        if (targetPlayer == null) {
            reply(event, "❌ `$targetName` is not online")
            return
        }
        val backend = targetPlayer.currentServer.map { it.serverInfo.name }.orElse(null)
        if (backend == null) {
            reply(event, "❌ `$targetName` is connected but not on a backend")
            return
        }
        val sent = execRouter.executeOnBackend(backend, "$verb $body", verbose, event)
        if (!sent) {
            reply(event, "❌ couldn't route `$verb` to `$backend`")
        }
    }

    private fun handleTell(event: MessageReceivedEvent, member: Member?, displayName: String, rest: String) {
        if (!requireStaff(event, member, ">tell $rest")) return
        val parts = rest.split(' ', limit = 2)
        if (parts.size < 2 || parts[0].isBlank() || parts[1].isBlank()) {
            reply(event, "Usage: `>tell <player> <message>`")
            return
        }
        val targetName = parts[0]
        val msg = parts[1]
        val component = Component.text("[Discord→DM from $displayName] $msg")
            .color(ChatDispatcher.COLOR_DISCORD_DM)
        val found = dispatcher.sendToPlayer(targetName, component)
        if (found) {
            reply(event, "✅ DM'd `$targetName`")
        } else {
            reply(event, "❌ `$targetName` is not online")
        }
    }

    private fun handleSay(event: MessageReceivedEvent, member: Member?, rest: String) {
        if (!requireStaff(event, member, ">say $rest")) return
        if (rest.isBlank()) {
            reply(event, "Usage: `>say <message>`")
            return
        }
        val component = Component.text("[Staff] $rest")
            .color(ChatDispatcher.COLOR_DISCORD_STAFF_SAY)
        dispatcher.broadcastGlobal(component)
        reply(event, "✅ broadcast network-wide")
    }

    /** Send a Discord-style reply threaded under the user's command message. */
    private fun reply(event: MessageReceivedEvent, content: String) {
        event.message.reply(content).mentionRepliedUser(false).queue()
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
        const val SYSTEM_USERNAME = "Server"

        // Discord embed sidebar colors for system events.
        const val COLOR_JOIN = 0x57F287        // Discord green
        const val COLOR_LEAVE = 0xED4245       // Discord red
        const val COLOR_SWITCH = 0x5865F2      // Discord blurple
        const val COLOR_DEATH = 0x4F545C       // Dark gray
        const val COLOR_ADVANCEMENT = 0xFAA61A // Gold

        // `>cmd` target keywords mapped to canonical names. Aliases match the
        // existing chat-prefix vocabulary.
        val CMD_TARGETS: Map<String, String> = mapOf(
            "proxy" to "proxy",
            "velocity" to "proxy",
            "lobby" to "lobby",
            "hub" to "lobby",
            "mc" to "mc",
            "survival" to "mc",
        )

        const val MAX_OUTPUT_CHARS = 1500

        const val USAGE_CMD =
            "❌ Usage: `>cmd <proxy|lobby|mc> <command> [-v]`\n" +
            "Proxy commands: `glist`, `server`, `send`, `velocity`, `shutdown`. " +
            "Backend commands → `>cmd lobby <command>` or `>cmd mc <command>`. " +
            "Add `-v` to see output."

        const val PROXY_HINT =
            "Proxy commands: `glist`, `server`, `send`, `velocity`, `shutdown`. " +
            "For backend commands use `>cmd lobby ...` or `>cmd mc ...`."

        // Matches >word, optionally followed by whitespace + body. The body group
        // is empty for arg-less commands like ">help" / ">who" / ">servers".
        private val PREFIX_REGEX = Regex("""^>(\w+)(?:\s+([\s\S]+))?$""")
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

    /** Emit an unquoted JSON value (numbers, booleans, null). Caller must ensure validity. */
    fun fieldRaw(name: String, value: String): JsonWriter {
        parts += "\"${escape(name)}\":$value"
        return this
    }

    /** Append a raw element to an array (for arr() writers). */
    fun element(value: JsonWriter): JsonWriter {
        parts += value.build()
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
