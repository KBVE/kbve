package com.kbve.discordrelay

import com.velocitypowered.api.proxy.ProxyServer
import org.slf4j.Logger
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/**
 * Periodically pings each registered backend and posts a Discord embed when
 * a backend transitions between up ↔ down. Lives on the proxy so we don't
 * need a backend plugin to phone home (which is impossible without a player
 * connection).
 *
 * Transitions:
 *   - First successful ping after start → no embed (just records initial state)
 *   - Up → down (FAILURE_THRESHOLD consecutive failures) → "🔴 <Server> went down"
 *   - Down → up (one successful ping) → "🟢 <Server> came online"
 *
 * The `FAILURE_THRESHOLD` ride-out prevents single transient ping failures
 * (network blip, garbage collection pause) from spamming the channel.
 */
class BackendStatusMonitor(
    private val server: ProxyServer,
    private val logger: Logger,
    private val bot: DiscordBot,
) {

    private enum class Status { UNKNOWN, UP, DOWN }

    private data class BackendState(var status: Status, var failures: Int)

    private val states = ConcurrentHashMap<String, BackendState>()
    private val scheduler: ScheduledExecutorService =
        Executors.newSingleThreadScheduledExecutor { r ->
            Thread(r, "kbve-discord-relay-backend-monitor").apply { isDaemon = true }
        }

    fun start() {
        scheduler.scheduleAtFixedRate(::pingAll, INITIAL_DELAY_SECONDS, PING_INTERVAL_SECONDS, TimeUnit.SECONDS)
        logger.info("BackendStatusMonitor started (interval={}s, failureThreshold={})", PING_INTERVAL_SECONDS, FAILURE_THRESHOLD)
    }

    fun shutdown() {
        scheduler.shutdownNow()
    }

    private fun pingAll() {
        try {
            for (rs in server.allServers) {
                val name = rs.serverInfo.name
                rs.ping().whenComplete { _, err ->
                    handleResult(name, err == null)
                }
            }
        } catch (t: Throwable) {
            logger.warn("BackendStatusMonitor pingAll error", t)
        }
    }

    private fun handleResult(name: String, success: Boolean) {
        val state = states.computeIfAbsent(name) { BackendState(Status.UNKNOWN, 0) }
        synchronized(state) {
            if (success) {
                val previous = state.status
                state.status = Status.UP
                state.failures = 0
                if (previous == Status.DOWN) {
                    bot.postSystemEmbed("🟢 ${displayName(name)} came online", DiscordBot.COLOR_JOIN, null)
                }
                // UNKNOWN → UP is the initial-state case; intentionally silent.
            } else {
                state.failures += 1
                if (state.status != Status.DOWN && state.failures >= FAILURE_THRESHOLD) {
                    state.status = Status.DOWN
                    bot.postSystemEmbed("🔴 ${displayName(name)} went down", DiscordBot.COLOR_LEAVE, null)
                }
            }
        }
    }

    private fun displayName(serverName: String): String = when (serverName) {
        "lobby" -> "Lobby"
        "mc" -> "Survival"
        else -> serverName.replaceFirstChar { it.uppercase() }
    }

    companion object {
        const val PING_INTERVAL_SECONDS = 30L
        const val INITIAL_DELAY_SECONDS = 15L  // let backends finish booting first
        const val FAILURE_THRESHOLD = 3        // ~90s of consecutive failures before declaring down
    }
}
