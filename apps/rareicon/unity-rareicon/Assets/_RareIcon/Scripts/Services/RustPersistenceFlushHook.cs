using UnityEngine;

namespace RareIcon
{
    /// <summary>MonoBehaviour bridge that forces a Rust SQLite flush on app pause / focus loss / quit. Catches the windows where the periodic <see cref="RustPersistenceFlushSystem"/> hasn't fired yet — minimises lost ghost-sim state on backgrounding or hard close.</summary>
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
            if (paused) Flush();
        }

        void OnApplicationFocus(bool focused)
        {
            if (!focused) Flush();
        }

        void OnApplicationQuit() => Flush();

        static void Flush()
        {
            var w = WorldStoreSystem.Instance;
            if (w == null || !w.IsValid) return;
            w.Flush();
        }
    }
}
