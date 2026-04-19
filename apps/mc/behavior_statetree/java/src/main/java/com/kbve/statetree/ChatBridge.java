package com.kbve.statetree;

/**
 * JNI bridge to the Rust {@code bevy_chat} IRC client, wrapped via the
 * {@code ffi} feature of the shared {@code bevy_chat} crate.
 *
 * <p>The native library that hosts these symbols is the same
 * {@code behavior_statetree} cdylib loaded by {@link NativeRuntime}. Its
 * static initializer runs first (by class-loading order) and takes care of
 * extracting and {@code System.load()}-ing the shared library, so this
 * class only needs to reference it to guarantee load order. We do NOT
 * call {@code System.load} a second time — the JVM only needs one handle.
 *
 * <p>This class is thread-safe. The opaque handle is just a native pointer
 * (cast to {@code long}); all the locking is done in Rust.
 *
 * <h2>Lifecycle</h2>
 * <pre>
 *   long h = ChatBridge.connect("ergo-irc-service.irc.svc.cluster.local",
 *                               6667, false, "mc-server",
 *                               System.getenv("IRC_PASSWORD"),
 *                               "#world-events");
 *   if (h == 0) throw new RuntimeException("IRC connect failed");
 *
 *   ChatBridge.send(h, "kill", "Steve", "minecraft", "#world-events",
 *                   "Steve slew the Ender Dragon", "{\"boss\":\"Ender Dragon\"}");
 *
 *   // ... later, on server stop:
 *   ChatBridge.disconnect(h);
 * </pre>
 */
public final class ChatBridge {

    // Force-load NativeRuntime so the shared library is available before
    // any of these natives are linked. The JVM resolves native methods
    // lazily on first call, so this just guarantees load order.
    static {
        @SuppressWarnings("unused")
        Class<?> _init = NativeRuntime.class;
    }

    private ChatBridge() {}

    /**
     * Connect to an IRC server and return an opaque handle.
     *
     * @param host IRC server hostname or IP
     * @param port typically 6667 (plain) or 6697 (TLS)
     * @param tls if true, use TLS
     * @param nick registered nickname (must match account if ergo enforces
     *             {@code force-nick-equals-account})
     * @param password server password (PASS), or null/empty for none
     * @param channels comma-separated channel list, e.g. "#world-events,#global"
     * @return opaque handle (nonzero) on success, {@code 0} on failure
     */
    public static native long connect(String host, int port, boolean tls,
                                       String nick, String password, String channels);

    /**
     * Send a structured chat message.
     *
     * @param handle handle from {@link #connect}
     * @param kind one of "chat", "system", "kill", "rare_drop", "capture",
     *             "quest_complete", "area_unlocked", "death", "craft", or any
     *             custom string (emitted as {@code EVENT:<UPPER>})
     * @param sender display name (player, NPC, or "System")
     * @param platform source platform, e.g. "minecraft"
     * @param channel IRC channel, e.g. "#world-events"
     * @param content human-readable message
     * @param payloadJson optional JSON object as a string, or null
     * @return true on success; false on bad args or transport error
     */
    public static native boolean send(long handle, String kind, String sender,
                                       String platform, String channel,
                                       String content, String payloadJson);

    /**
     * Drain pending incoming messages as a JSON array.
     *
     * <p>Returns {@code "[]"} when the queue is empty, or null on error.
     * Each element is a {@code ChatMessage} object:
     * <pre>
     *   { "kind": "chat", "sender": "...", "platform": "...",
     *     "channel": "#global", "content": "...", "payload": {...}? }
     * </pre>
     */
    public static native String poll(long handle);

    /** Returns true if the underlying IRC connection is active. */
    public static native boolean isConnected(long handle);

    /** Close the connection and free the handle. Safe to call on a zero handle. */
    public static native void disconnect(long handle);
}
