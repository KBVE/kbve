using Unity.Entities;
using UnityEngine;

namespace RareIcon
{
    /// <summary>MonoBehaviour bridge that drives a full Rust persistence flush on app pause / focus loss / quit. Looks up <see cref="RustPersistenceFlushSystem"/> in the gameplay world and calls <c>ForceFlushNow</c> so live + unloaded state both get pushed before the OS reclaims the process. Falls back to a bare <c>NativeWorld.Flush</c> if the ECS system isn't reachable (early-shutdown corner cases).</summary>
    [DefaultExecutionOrder(-10000)]
    public sealed class RustPersistenceFlushHook : MonoBehaviour
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Bootstrap()
        {
            var go = new GameObject("[RustPersistenceFlushHook]");
            go.AddComponent<RustPersistenceFlushHook>();
            DontDestroyOnLoad(go);
        }

        void OnApplicationPause(bool paused)
        {
            if (paused) Flush("pause");
        }

        void OnApplicationFocus(bool focused)
        {
            if (!focused) Flush("focus-lost");
        }

        void OnApplicationQuit() => Flush("quit");

        static void Flush(string reason)
        {
            var world = GameplayWorld.Resolve();
            if (world != null && world.IsCreated)
            {
                var sys = world.GetExistingSystemManaged<RustPersistenceFlushSystem>();
                if (sys != null) { sys.ForceFlushNow(reason); return; }
            }

            var nw = WorldStoreSystem.Instance;
            if (nw != null && nw.IsValid) nw.Flush();
        }
    }
}
