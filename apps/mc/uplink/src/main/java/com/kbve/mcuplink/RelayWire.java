package com.kbve.mcuplink;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;

/**
 * Builds the wire payload for the kbve:relay-events plugin-messaging channel.
 *
 * Format: a single JSON object framed by {@code DataOutputStream.writeUTF(...)}
 * (i.e. a 2-byte unsigned big-endian length prefix followed by modified-UTF-8
 * bytes). The Velocity-side {@code RelayEventChannel} parses with the matching
 * {@code DataInputStream.readUTF()} + Gson.
 *
 * JSON shape:
 * <pre>
 * { "type": "death" | "advancement",
 *   "uuid": "<dashed-uuid>",
 *   "name": "<player-name>",
 *   "server": "mc",
 *   "data": { ...type-specific... } }
 * </pre>
 */
public final class RelayWire {

    public static final String CHANNEL_NAMESPACE = "kbve";
    public static final String CHANNEL_NAME = "relay-events";
    public static final String SERVER_NAME = "mc";

    private RelayWire() {}

    public static byte[] deathPayload(String uuid, String name, String message) {
        String json = new JsonWriter()
                .field("type", "death")
                .field("uuid", uuid)
                .field("name", name)
                .field("server", SERVER_NAME)
                .field("data", new JsonWriter().field("message", message))
                .build();
        return frame(json);
    }

    public static byte[] advancementPayload(String uuid, String name, String title, String key) {
        String json = new JsonWriter()
                .field("type", "advancement")
                .field("uuid", uuid)
                .field("name", name)
                .field("server", SERVER_NAME)
                .field("data", new JsonWriter().field("title", title).field("key", key))
                .build();
        return frame(json);
    }

    private static byte[] frame(String json) {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (DataOutputStream out = new DataOutputStream(baos)) {
            out.writeUTF(json);
        } catch (IOException e) {
            throw new RuntimeException("framing failure (in-memory stream)", e);
        }
        return baos.toByteArray();
    }

    /** Tiny zero-dep JSON object writer matching the Paper + Velocity sides. */
    private static final class JsonWriter {
        private final java.util.List<String> parts = new java.util.ArrayList<>();

        JsonWriter field(String name, String value) {
            parts.add("\"" + escape(name) + "\":\"" + escape(value) + "\"");
            return this;
        }

        JsonWriter field(String name, JsonWriter value) {
            parts.add("\"" + escape(name) + "\":" + value.build());
            return this;
        }

        String build() {
            return "{" + String.join(",", parts) + "}";
        }

        private static String escape(String s) {
            StringBuilder sb = new StringBuilder(s.length() + 2);
            for (int i = 0; i < s.length(); i++) {
                char ch = s.charAt(i);
                switch (ch) {
                    case '\\': sb.append("\\\\"); break;
                    case '"':  sb.append("\\\""); break;
                    case '\n': sb.append("\\n"); break;
                    case '\r': sb.append("\\r"); break;
                    case '\t': sb.append("\\t"); break;
                    case '\b': sb.append("\\b"); break;
                    case '\f': sb.append("\\f"); break;
                    default:
                        if (ch < 0x20) {
                            sb.append(String.format("\\u%04x", (int) ch));
                        } else {
                            sb.append(ch);
                        }
                }
            }
            return sb.toString();
        }
    }
}
