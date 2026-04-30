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
    /// silently re-enable the mobile binary.
    /// </remarks>
    [InitializeOnLoad]
    internal static class SteamPluginPlatformGate
    {
        static SteamPluginPlatformGate()
        {
            ApplyMobileLockdown();
        }

        [MenuItem("Tools/RareIcon/Re-apply Steam mobile plugin lockdown")]
        private static void ApplyMobileLockdownMenu() => ApplyMobileLockdown();

        private static void ApplyMobileLockdown()
        {
            foreach (var importer in PluginImporter.GetImporters(BuildTarget.Android))
            {
                if (!IsSteamPlugin(importer.assetPath)) continue;
                if (importer.GetCompatibleWithPlatform(BuildTarget.Android))
                {
                    importer.SetCompatibleWithPlatform(BuildTarget.Android, false);
                    importer.SaveAndReimport();
                    Debug.Log($"[SteamPluginGate] disabled Android compat for {importer.assetPath}");
                }
            }

            foreach (var importer in PluginImporter.GetImporters(BuildTarget.iOS))
            {
                if (!IsSteamPlugin(importer.assetPath)) continue;
                if (importer.GetCompatibleWithPlatform(BuildTarget.iOS))
                {
                    importer.SetCompatibleWithPlatform(BuildTarget.iOS, false);
                    importer.SaveAndReimport();
                    Debug.Log($"[SteamPluginGate] disabled iOS compat for {importer.assetPath}");
                }
            }

            foreach (var importer in PluginImporter.GetImporters(BuildTarget.WebGL))
            {
                if (!IsSteamPlugin(importer.assetPath)) continue;
                if (importer.GetCompatibleWithPlatform(BuildTarget.WebGL))
                {
                    importer.SetCompatibleWithPlatform(BuildTarget.WebGL, false);
                    importer.SaveAndReimport();
                    Debug.Log($"[SteamPluginGate] disabled WebGL compat for {importer.assetPath}");
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
