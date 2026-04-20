using Unity.Entities;
using UnityEngine;
using RareIcon.Native;

namespace RareIcon
{
    /// <summary>
    /// Owns the lifecycle of the Rust-side persistent world store
    /// (<see cref="NativeWorld"/>) and exposes a static accessor so
    /// other ECS systems can push/pull ghost-chunk state without a DI
    /// dependency.
    ///
    /// Pattern matches HexHoverSystem's static lookup map — a single
    /// SystemBase instance owns the resource, callers go through the
    /// static method. The Rust side runs its own background tick thread
    /// so there is no per-frame work here.
    /// </summary>
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial class WorldStoreSystem : SystemBase
    {
        static NativeWorld _instance;

        /// <summary>
        /// The shared NativeWorld handle, or null if the system hasn't
        /// initialized yet (e.g., very first frame) or the dylib failed
        /// to load. Callers should null-check.
        /// </summary>
        public static NativeWorld Instance => _instance;

        protected override void OnCreate()
        {
            // Empty query — this system doesn't read entities, it only
            // owns the native handle. Without this, OnUpdate is skipped.
            // We keep OnUpdate empty (Rust ticks itself) but the system
            // still needs to exist for OnCreate/OnDestroy to fire.
            try
            {
                _instance = new NativeWorld();
                if (_instance.IsValid)
                {
                    Debug.Log("[WorldStoreSystem] uniti world store initialized");
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

        protected override void OnUpdate()
        {
            // Intentionally empty — Rust owns the tick cadence on its own
            // background thread. C# only touches the store at chunk load /
            // unload boundaries (HexChunkSystem hooks).
        }

        protected override void OnDestroy()
        {
            _instance?.Dispose();
            _instance = null;
        }
    }
}
