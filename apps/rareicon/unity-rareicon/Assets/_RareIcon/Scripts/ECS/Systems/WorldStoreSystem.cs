using System.IO;
using Unity.Entities;
using UnityEngine;
using RareIcon.Native;

namespace RareIcon
{
    /// <summary>Owns the Rust-side <see cref="NativeWorld"/> lifecycle and exposes it via a static accessor. Opens a SQLite-backed store at <c>Application.persistentDataPath/worldstore.db</c> so chunk state (hexes, ghost units, unloaded buildings) persists across process restart.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial class WorldStoreSystem : SystemBase
    {
        const string SaveFileName = "worldstore.db";

        /// <summary>Absolute path to the live SQLite worldstore. Save / restore round-trips target this file via <see cref="NativeWorld.Archive"/> + <see cref="Native.NativeWorld.Restore"/>.</summary>
        public static string LiveDbPath =>
            Path.Combine(Application.persistentDataPath, SaveFileName);

        static NativeWorld _instance;

        /// <summary>Shared <see cref="NativeWorld"/> handle, or null if not yet initialized / dylib failed to load.</summary>
        public static NativeWorld Instance => _instance;

        protected override void OnCreate()
        {
            try
            {
                uint nativeVer = NativeWorld.NativeSchemaVersion();
                if (nativeVer != NativeWorld.ExpectedSchemaVersion)
                {
                    Debug.LogError($"[WorldStoreSystem] FFI schema mismatch — Rust dylib reports v{nativeVer}, C# expects v{NativeWorld.ExpectedSchemaVersion}. Rebuild the dylib via `npx nx run uniti:build:macos` (or :windows / :linux) so csbindgen regenerates Uniti.g.cs against the new struct layout. Falling back to in-memory store; persistence disabled this session.");
                    _instance = new NativeWorld();
                    return;
                }

                string dbPath = Path.Combine(Application.persistentDataPath, SaveFileName);
                _instance = NativeWorld.OpenAtPath(dbPath);
                if (_instance == null)
                {
                    // Disk path rejected (e.g. readonly volume) — fall back
                    // to in-memory so the rest of the game still runs.
                    Debug.LogWarning($"[WorldStoreSystem] SQLite open failed for {dbPath}; falling back to in-memory store (no disk persistence this session).");
                    _instance = new NativeWorld();
                }

                if (_instance.IsValid)
                {
                    Debug.Log($"[WorldStoreSystem] uniti world store initialized (db: {dbPath})");
                }
                else
                {
                    Debug.LogError("[WorldStoreSystem] uniti world store handle is invalid — dylib loaded but constructor failed");
                }
            }
            catch (System.DllNotFoundException ex)
            {
                Debug.LogError($"[WorldStoreSystem] libuniti.dylib not found: {ex.Message}\n" +
                               "Run `npx nx run uniti:build:macos` to build it.");
            }
            catch (System.Exception ex)
            {
                Debug.LogError($"[WorldStoreSystem] failed to initialize NativeWorld: {ex}");
            }
        }

        protected override void OnUpdate() { }

        protected override void OnDestroy()
        {
            // Synchronous final flush so any in-flight dirty chunks land on
            // disk before the NativeWorld drop runs (which also flushes,
            // but only opportunistically on thread join).
            _instance?.Flush();
            _instance?.Dispose();
            _instance = null;
        }
    }
}
