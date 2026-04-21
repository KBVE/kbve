using Unity.Entities;
using UnityEngine;
using RareIcon.Native;

namespace RareIcon
{
    /// <summary>Owns the Rust-side <see cref="NativeWorld"/> lifecycle and exposes it via a static accessor.</summary>
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial class WorldStoreSystem : SystemBase
    {
        static NativeWorld _instance;

        /// <summary>Shared <see cref="NativeWorld"/> handle, or null if not yet initialized / dylib failed to load.</summary>
        public static NativeWorld Instance => _instance;

        protected override void OnCreate()
        {
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

        protected override void OnUpdate() { }

        protected override void OnDestroy()
        {
            _instance?.Dispose();
            _instance = null;
        }
    }
}
