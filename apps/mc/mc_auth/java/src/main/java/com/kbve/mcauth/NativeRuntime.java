package com.kbve.mcauth;

import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;

/**
 * JNI bridge to the Rust {@code mc_auth} native library.
 *
 * <p>The native library hosts a Tokio runtime that asynchronously resolves
 * Minecraft ↔ Supabase auth flows. The Fabric join handler submits auth
 * requests via {@link #authenticate(String, String)} and drains deferred
 * events via {@link #pollEvents()} on the server tick.
 *
 * <p>The .so/.dll/.dylib is bundled inside the JAR at {@code natives/} and
 * extracted to a temp file at load time, then loaded via
 * {@link System#load(String)} with the absolute path — the same strategy
 * used by {@code behavior_statetree}.
 */
public final class NativeRuntime {

    private static boolean loaded = false;

    static {
        try {
            String os = System.getProperty("os.name").toLowerCase();
            String lib;
            if (os.contains("linux")) {
                lib = "libmc_auth.so";
            } else if (os.contains("win")) {
                lib = "mc_auth.dll";
            } else if (os.contains("mac")) {
                lib = "libmc_auth.dylib";
            } else {
                throw new UnsupportedOperationException("Unsupported OS: " + os);
            }

            // Extract from JAR to temp file, then load via absolute path
            String resourcePath = "/natives/" + lib;
            InputStream in = NativeRuntime.class.getResourceAsStream(resourcePath);
            if (in == null) {
                throw new UnsatisfiedLinkError("Native library not found in JAR: " + resourcePath);
            }

            File tempFile = File.createTempFile("mc_auth_", "_" + lib);
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
            System.out.println("[mc_auth] Native library loaded from " + tempFile.getAbsolutePath());
        } catch (Exception e) {
            System.err.println("[mc_auth] Failed to load native library: " + e.getMessage());
            loaded = false;
        }
    }

    /** Start the Tokio auth runtime. Call once during mod initialization. */
    public static native void init();

    /**
     * Submit an auth request for a connecting player.
     *
     * @param uuid     canonical Minecraft UUID (with dashes)
     * @param username current in-game username
     * @return JSON-serialized {@code AuthResponse} (status/linked/supabase_user_id/error)
     */
    public static native String authenticate(String uuid, String username);

    /**
     * Poll all pending player events as a JSON array.
     * Call each server tick to drain results.
     *
     * @return JSON array of {@code PlayerEvent} objects
     */
    public static native String pollEvents();

    /** Shutdown the Tokio runtime. Call during mod shutdown. */
    public static native void shutdown();

    /** Check if the native library loaded successfully. */
    public static boolean isLoaded() {
        return loaded;
    }

    private NativeRuntime() {}
}
