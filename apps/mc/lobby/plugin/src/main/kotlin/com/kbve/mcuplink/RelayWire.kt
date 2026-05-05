package com.kbve.mcuplink

import java.io.ByteArrayOutputStream
import java.io.DataOutputStream

/**
 * Builds the wire payload for the kbve:relay-events plugin-messaging channel.
 *
 * Format: a single JSON object framed by `DataOutputStream.writeUTF(...)`
 * (i.e. a 2-byte unsigned big-endian length prefix followed by modified-UTF-8
 * bytes). The Velocity-side `RelayEventChannel` parses with the matching
 * `DataInputStream.readUTF()` + Gson.
 *
 * JSON shape:
 * ```
 * { "type": "death" | "advancement",
 *   "uuid": "<dashed-uuid>",
 *   "name": "<player-name>",
 *   "server": "lobby",
 *   "data": { ...type-specific... } }
 * ```
 */
object RelayWire {

    const val CHANNEL = "kbve:relay-events"
    const val SERVER_NAME = "lobby"

    fun deathPayload(uuid: String, name: String, message: String): ByteArray =
        frame(
            JsonWriter.obj()
                .field("type", "death")
                .field("uuid", uuid)
                .field("name", name)
                .field("server", SERVER_NAME)
                .field("data", JsonWriter.obj().field("message", message))
                .build()
        )

    fun advancementPayload(uuid: String, name: String, title: String, key: String): ByteArray =
        frame(
            JsonWriter.obj()
                .field("type", "advancement")
                .field("uuid", uuid)
                .field("name", name)
                .field("server", SERVER_NAME)
                .field("data", JsonWriter.obj().field("title", title).field("key", key))
                .build()
        )

    /**
     * Reply to an `exec` command sent by the proxy. [correlation] echoes the
     * UUID from the inbound exec payload so the proxy can match this back to
     * the originating Discord message.
     */
    fun execResultPayload(correlation: String, ok: Boolean, output: String): ByteArray =
        frame(
            JsonWriter.obj()
                .field("type", "exec_result")
                .field("uuid", correlation)
                .field("server", SERVER_NAME)
                .field("data", JsonWriter.obj().fieldRaw("ok", ok.toString()).field("output", output))
                .build()
        )

    private fun frame(json: String): ByteArray {
        val baos = ByteArrayOutputStream()
        DataOutputStream(baos).use { it.writeUTF(json) }
        return baos.toByteArray()
    }
}

/** Tiny zero-dep JSON object writer matching the Velocity-side JsonWriter. */
internal class JsonWriter private constructor() {
    private val parts = mutableListOf<String>()

    fun field(name: String, value: String): JsonWriter {
        parts += "\"${escape(name)}\":\"${escape(value)}\""
        return this
    }

    fun field(name: String, value: JsonWriter): JsonWriter {
        parts += "\"${escape(name)}\":${value.build()}"
        return this
    }

    /** Emit an unquoted JSON value (numbers, booleans, null). Caller ensures validity. */
    fun fieldRaw(name: String, value: String): JsonWriter {
        parts += "\"${escape(name)}\":$value"
        return this
    }

    fun build(): String = parts.joinToString(",", "{", "}")

    companion object {
        fun obj() = JsonWriter()

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
