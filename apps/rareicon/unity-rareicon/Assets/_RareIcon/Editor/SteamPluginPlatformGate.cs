using UnityEditor;
using UnityEngine;

namespace RareIcon.EditorTools
{
    /// <summary>
    /// Forces every Steamworks.NET native plugin (steam_api*, libsteam_api.*)
    /// to be disabled on iOS, Android, and WebGL targets. Steamworks.NET ships
    /// an `androidarm64/libsteam_api.so` binary by default — without this gate
    /// Unity would bundle the Steam SDK into Android APKs even though the
    /// managed Steam wrapper code is excluded by the `RareIcon.Platform` asmdef.
    /// </summary>
    /// <remarks>
    /// Runs once on every domain reload so a UPM package re-resolve (which
    /// regenerates plugin .meta files inside Library/PackageCache) doesn't
    /// silently re-enable the mobile binary. Uses the string-based
    /// PluginImporter API so it compiles even when the Android, iOS, and
    /// WebGL build modules aren't installed (CI runners ship minimal Unity).
    /// </remarks>
    [InitializeOnLoad]
    internal static class SteamPluginPlatformGate
    {
        private static readonly string[] LockedPlatforms = { "Android", "iOS", "WebGL" };

        static SteamPluginPlatformGate()
        {
            ApplyMobileLockdown();
        }

        [MenuItem("Tools/RareIcon/Re-apply Steam mobile plugin lockdown")]
        private static void ApplyMobileLockdownMenu() => ApplyMobileLockdown();

        private static void ApplyMobileLockdown()
        {
            foreach (var platform in LockedPlatforms)
            {
                foreach (var importer in PluginImporter.GetImporters(platform))
                {
                    if (!IsSteamPlugin(importer.assetPath)) continue;
                    if (!importer.GetCompatibleWithPlatform(platform)) continue;

                    importer.SetCompatibleWithPlatform(platform, false);
                    importer.SaveAndReimport();
                    Debug.Log($"[SteamPluginGate] disabled {platform} compat for {importer.assetPath}");
                }
            }
        }

        private static bool IsSteamPlugin(string assetPath)
        {
            if (string.IsNullOrEmpty(assetPath)) return false;
            return assetPath.Contains("com.rlabrecque.steamworks.net")
                && (assetPath.Contains("steam_api") || assetPath.Contains("libsteam_api"));
        }
    }
}
