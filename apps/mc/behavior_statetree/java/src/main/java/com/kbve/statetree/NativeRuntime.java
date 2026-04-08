package com.kbve.statetree;

/**
 * JNI bridge to the Rust behavior_statetree native library.
 *
 * <p>The native library runs a Tokio runtime that processes NPC AI decisions
 * asynchronously. The Fabric server tick thread submits observations and
 * polls completed intents each tick.
 *
 * <p>Architecture: Tokio = AI brain, Fabric server tick = body + law.
 * All communication uses bounded channels with immutable JSON snapshots.
 */
public final class NativeRuntime {

    private static boolean loaded = false;

    static {
        try {
            // Load from natives/ inside the mod JAR (extracted at runtime)
            String os = System.getProperty("os.name").toLowerCase();
            String lib;
            if (os.contains("linux")) {
                lib = "libbehavior_statetree.so";
            } else if (os.contains("win")) {
                lib = "behavior_statetree.dll";
            } else if (os.contains("mac")) {
                lib = "libbehavior_statetree.dylib";
            } else {
                throw new UnsupportedOperationException("Unsupported OS: " + os);
            }
            System.loadLibrary("behavior_statetree");
            loaded = true;
        } catch (UnsatisfiedLinkError e) {
            System.err.println("[behavior_statetree] Failed to load native library: " + e.getMessage());
            loaded = false;
        }
    }

    /** Start the Tokio AI runtime. Call once during mod initialization. */
    public static native void init();

    /**
     * Submit an NPC observation as JSON for async AI planning.
     *
     * @param observationJson JSON-serialized NpcObservation
     * @return true if accepted, false if back-pressured
     */
    public static native boolean submitJob(String observationJson);

    /**
     * Poll all completed NPC intents as a JSON array.
     * Call each server tick to drain results.
     *
     * @return JSON array of NpcIntent objects
     */
    public static native String pollIntents();

    /** Shutdown the Tokio runtime. Call during mod shutdown. */
    public static native void shutdown();

    /** Check if the native library loaded successfully. */
    public static boolean isLoaded() {
        return loaded;
    }

    private NativeRuntime() {}
}
