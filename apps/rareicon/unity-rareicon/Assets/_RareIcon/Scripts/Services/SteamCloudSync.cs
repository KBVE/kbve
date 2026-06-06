
#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS
#define RAREICON_STEAM_CLOUD
#endif

using System.IO;
using UnityEngine;
#if RAREICON_STEAM_CLOUD
using Steamworks;
using RareIcon.Platform;
#endif

namespace RareIcon
{
    /// <summary>Steam Cloud bridge for save bundles. Mirrors every <see cref="SaveSlotService"/> write into Steam's per-user remote storage so saves roam across devices. Gated behind the same standalone-only define <see cref="SteamManager"/> uses; non-Steam platforms compile to silent stubs so save / delete still build clean. Every Steamworks call is additionally wrapped in try/catch so itch.io / standalone-without-Steam launches degrade silently when the native DLL is absent. Steam Auto-Cloud (configured in Steamworks AppDB to glob persistentDataPath/saves/*.world) handles the directory mirror; this class is the explicit-fallback path for builds where Auto-Cloud isn't enabled.</summary>
    public static class SteamCloudSync
    {
        public static bool IsAvailable
        {
            get
            {
#if RAREICON_STEAM_CLOUD
                try
                {
                    return SteamManager.IsReady
                        && SteamRemoteStorage.IsCloudEnabledForAccount()
                        && SteamRemoteStorage.IsCloudEnabledForApp();
                }
                catch (System.DllNotFoundException)
                {

                    return false;
                }
                catch (System.Exception)
                {
                    return false;
                }
#else
                return false;
#endif
            }
        }

        /// <summary>Pushes <paramref name="localPath"/> up to Steam Cloud under <paramref name="remoteName"/>. No-op if Steam isn't initialized, Cloud is off for this account / app, or the file doesn't exist. Returns true on a successful upload. Catches every Steamworks exception (including the DllNotFoundException itch.io builds throw when steam_api64 is absent) so the save flow always returns a clean bool to the caller.</summary>
        public static bool Upload(string localPath, string remoteName)
        {
            if (string.IsNullOrEmpty(localPath) || string.IsNullOrEmpty(remoteName)) return false;
            if (!File.Exists(localPath)) return false;
#if RAREICON_STEAM_CLOUD
            try
            {
                if (!IsAvailable) return false;
                byte[] bytes = File.ReadAllBytes(localPath);
                bool ok = SteamRemoteStorage.FileWrite(remoteName, bytes, bytes.Length);
                if (ok) Debug.Log($"[SteamCloudSync] uploaded {remoteName} ({bytes.Length} bytes)");
                else    Debug.LogError($"[SteamCloudSync] FileWrite failed for {remoteName}");
                return ok;
            }
            catch (System.DllNotFoundException)
            {
                return false;
            }
            catch (System.Exception e)
            {
                Debug.LogError($"[SteamCloudSync] upload {remoteName} threw: {e.Message}");
                return false;
            }
#else
            return false;
#endif
        }

        /// <summary>Removes <paramref name="remoteName"/> from Steam Cloud. No-op when Steam isn't available; returns true on success or when the entry already didn't exist.</summary>
        public static bool Delete(string remoteName)
        {
            if (string.IsNullOrEmpty(remoteName)) return false;
#if RAREICON_STEAM_CLOUD
            try
            {
                if (!IsAvailable) return false;
                if (!SteamRemoteStorage.FileExists(remoteName)) return true;
                bool ok = SteamRemoteStorage.FileDelete(remoteName);
                if (!ok) Debug.LogError($"[SteamCloudSync] FileDelete failed for {remoteName}");
                return ok;
            }
            catch (System.DllNotFoundException)
            {
                return false;
            }
            catch (System.Exception e)
            {
                Debug.LogError($"[SteamCloudSync] delete {remoteName} threw: {e.Message}");
                return false;
            }
#else
            return false;
#endif
        }
    }
}
