package com.kbve.statetree;

import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;

/**
 * JNI bridge to the Rust behavior_statetree native library.
 *
 * <p>The native library runs a Tokio runtime that processes NPC AI decisions
 * asynchronously. The Fabric server tick thread submits observations and
 * polls completed intents each tick.
 *
 * <p>Architecture: Tokio = AI brain, Fabric server tick = body + law.
 * All communication uses bounded channels with immutable JSON snapshots.
 *
 * <p>The .so/.dll/.dylib is bundled inside the JAR at natives/ and extracted
 * to a temp file at load time, then loaded via System.load() with the
 * absolute path.
 */
public final class NativeRuntime {

    private static boolean loaded = false;

    static {
        try {
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

            // Extract from JAR to temp file, then load via absolute path
            String resourcePath = "/natives/" + lib;
            InputStream in = NativeRuntime.class.getResourceAsStream(resourcePath);
            if (in == null) {
                throw new UnsatisfiedLinkError("Native library not found in JAR: " + resourcePath);
            }

            File tempFile = File.createTempFile("behavior_statetree_", "_" + lib);
            tempFile.deleteOnExit();

            try (OutputStream out = Files.newOutputStream(tempFile.toPath())) {
                byte[] buf = new byte[8192];
                int len;
                while ((len = in.read(buf)) != -1) {
                    out.write(buf, 0, len);
                }
            }
            in.close();

            System.load(tempFile.getAbsolutePath());
            loaded = true;
            System.out.println("[behavior_statetree] Native library loaded from " + tempFile.getAbsolutePath());
        } catch (Exception e) {
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
