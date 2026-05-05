package com.kbve.mcuplink;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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

    /**
     * Reply to an `exec` command sent by the proxy. {@code correlation}
     * echoes the UUID from the inbound exec payload so the proxy can match
     * this back to the originating Discord message.
     */
    public static byte[] execResultPayload(String correlation, boolean ok, String output) {
        String json = new JsonWriter()
                .field("type", "exec_result")
                .field("uuid", correlation)
                .field("server", SERVER_NAME)
                .field("data", new JsonWriter()
                        .fieldRaw("ok", Boolean.toString(ok))
                        .field("output", output))
                .build();
        return frame(json);
    }

    /** Decoded `exec` payload from the proxy. Null if the bytes don't look like one. */
    public record ExecRequest(String correlation, String command) {}

    /**
     * Decode an inbound `exec` payload. We hand-roll a tiny JSON read because
     * the schema is fixed and tiny — pulling Gson in just for this would be
     * overkill (and risks a duplicate-class clash with Mojang's bundled Gson
     * in the dev runtime).
     *
     * Returns null if the payload isn't an exec event (e.g. it's something
     * else we should ignore).
     */
    public static ExecRequest parseExec(byte[] data) throws IOException {
        String json;
        try (DataInputStream in = new DataInputStream(new ByteArrayInputStream(data))) {
            json = in.readUTF();
        }
        // Tiny field extractor — only handles the flat shape this protocol uses.
        Matcher typeM = Pattern.compile("\"type\"\\s*:\\s*\"([^\"]+)\"").matcher(json);
        if (!typeM.find()) return null;
        if (!"exec".equals(typeM.group(1))) return null;

        Matcher uuidM = Pattern.compile("\"uuid\"\\s*:\\s*\"([^\"]+)\"").matcher(json);
        Matcher cmdM = Pattern.compile("\"command\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"").matcher(json);
        if (!uuidM.find() || !cmdM.find()) return null;
        return new ExecRequest(uuidM.group(1), unescape(cmdM.group(1)));
    }

    private static String unescape(String s) {
        StringBuilder sb = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            if (ch == '\\' && i + 1 < s.length()) {
                char n = s.charAt(++i);
                switch (n) {
                    case '"': sb.append('"'); break;
                    case '\\': sb.append('\\'); break;
                    case 'n': sb.append('\n'); break;
                    case 'r': sb.append('\r'); break;
                    case 't': sb.append('\t'); break;
                    case 'b': sb.append('\b'); break;
                    case 'f': sb.append('\f'); break;
                    case 'u':
                        if (i + 4 < s.length()) {
                            sb.append((char) Integer.parseInt(s.substring(i + 1, i + 5), 16));
                            i += 4;
                        }
                        break;
                    default: sb.append(n);
                }
            } else {
                sb.append(ch);
            }
        }
        return sb.toString();
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

        /** Emit an unquoted JSON value (numbers, booleans, null). Caller ensures validity. */
        JsonWriter fieldRaw(String name, String value) {
            parts.add("\"" + escape(name) + "\":" + value);
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
