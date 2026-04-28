// Steamworks.NET only compiles on Windows / macOS / Linux standalone. On
// mobile + web + server-only dedicated builds, the entire file is stripped
// via the platform guard so the project still builds without Steam linkage.
//
// Rareicon AppID = 2238370, stored in steam_appid.txt at the project root.
// Editor + non-released builds read the file on startup; the shipped Steam
// depot launcher supplies it via the Steam client instead.
//
// Set scripting define `DISABLESTEAMWORKS` on platforms where you want to
// compile standalone but skip Steam — useful for a dedicated Linux server
// build that still targets UNITY_STANDALONE_LINUX.
#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS

using System;
using Steamworks;
using UnityEngine;

namespace RareIcon.Platform
{
    /// <summary>Singleton MonoBehaviour bootstrap for the Steamworks SDK. Auto-spawns at runtime load via RuntimeInitializeOnLoadMethod, pumps SteamAPI.RunCallbacks each frame, cleans up on quit. Wraps SteamAPI.Init + Shutdown behind Initialized so game code queries IsReady without ever touching the raw Steam API. When the AppID is wrong, the Steam client is closed, or the DLL fails to load, IsReady stays false and game code falls back to the offline path.</summary>
    [DisallowMultipleComponent]
    public sealed class SteamManager : MonoBehaviour
    {
        static SteamManager _instance;

        public static bool IsReady => _instance != null && _instance._ready;

        /// <summary>Local player's SteamID (0 if Steam isn't ready).</summary>
        public static ulong LocalSteamId =>
            IsReady ? SteamUser.GetSteamID().m_SteamID : 0UL;

        /// <summary>Local player's Steam persona name ("" if not ready).</summary>
        public static string LocalPersonaName =>
            IsReady ? SteamFriends.GetPersonaName() : string.Empty;

        bool _ready;
        SteamAPIWarningMessageHook_t _warningHook;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        static void Bootstrap()
        {
            if (_instance != null) return;
            var go = new GameObject("[SteamManager]");
            _instance = go.AddComponent<SteamManager>();
            DontDestroyOnLoad(go);
        }

        void Awake()
        {
            if (_instance != null && _instance != this)
            {
                Destroy(gameObject);
                return;
            }

            if (!Packsize.Test())
            {
                Debug.LogError("[Steam] Wrong Steamworks.NET native library for the current platform. Check the UPM package integrity.");
                return;
            }
            if (!DllCheck.Test())
            {
                Debug.LogError("[Steam] steam_api DLL version mismatch with Steamworks.NET C# bindings.");
                return;
            }

            try
            {
                // Restarts via Steam if the game was launched outside (Editor
                // skips this; the steam_appid.txt file in the project root
                // lets the SDK know which AppID we're running as).
                if (!Application.isEditor && SteamAPI.RestartAppIfNecessary(AppId_t.Invalid))
                {
                    Application.Quit();
                    return;
                }
            }
            catch (DllNotFoundException e)
            {
                Debug.LogError($"[Steam] native steam_api library not found — {e}");
                return;
            }

            _ready = SteamAPI.Init();
            if (!_ready)
            {
                Debug.LogWarning("[Steam] SteamAPI.Init returned false. Steam client not running, AppID mismatch, or App is marked as released and the player doesn't own it. Running in offline mode.");
                return;
            }

            _warningHook = OnSteamWarning;
            SteamClient.SetWarningMessageHook(_warningHook);
            Debug.Log($"[Steam] initialized for persona '{SteamFriends.GetPersonaName()}' (SteamID {SteamUser.GetSteamID().m_SteamID})");
        }

        void Update()
        {
            if (_ready) SteamAPI.RunCallbacks();
        }

        void OnDestroy()
        {
            if (_instance != this) return;
            _instance = null;
            if (_ready)
            {
                SteamAPI.Shutdown();
                _ready = false;
            }
        }

        void OnApplicationQuit()
        {
            if (_ready)
            {
                SteamAPI.Shutdown();
                _ready = false;
            }
        }

        [AOT.MonoPInvokeCallback(typeof(SteamAPIWarningMessageHook_t))]
        static void OnSteamWarning(int severity, System.Text.StringBuilder text) =>
            Debug.LogWarning($"[Steam] {text}");
    }
}

#else

namespace RareIcon.Platform
{
    /// <summary>No-op Steam stub for platforms without Steamworks support. Game code still compiles + runs; Steam features return inert defaults.</summary>
    public static class SteamManager
    {
        public static bool IsReady => false;
        public static ulong LocalSteamId => 0UL;
        public static string LocalPersonaName => string.Empty;
    }
}

#endif
