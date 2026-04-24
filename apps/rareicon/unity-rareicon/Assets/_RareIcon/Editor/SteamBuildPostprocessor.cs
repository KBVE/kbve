using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace RareIcon.EditorTools
{
    /// <summary>Post-build hook that copies steam_appid.txt from the project root next to the shipped executable so the Steamworks SDK can discover the AppID on first launch without a Steam client override. Runs for Windows / macOS / Linux standalone; skipped on every other target since Steamworks.NET isn't linked there. Disabled entirely when the DISABLESTEAMWORKS scripting define is active (dedicated-server builds).</summary>
    public sealed class SteamBuildPostprocessor : IPostprocessBuildWithReport
    {
        public int callbackOrder => 0;

        public void OnPostprocessBuild(BuildReport report)
        {
#if DISABLESTEAMWORKS
            return;
#else
            UnityEditor.BuildTarget target = report.summary.platform;
            if (target != UnityEditor.BuildTarget.StandaloneWindows64
             && target != UnityEditor.BuildTarget.StandaloneWindows
             && target != UnityEditor.BuildTarget.StandaloneLinux64
             && target != UnityEditor.BuildTarget.StandaloneOSX)
            {
                return;
            }

            var source = Path.Combine(Directory.GetCurrentDirectory(), "steam_appid.txt");
            if (!File.Exists(source))
            {
                Debug.LogWarning($"[SteamBuild] steam_appid.txt not found at project root ({source}); Steam SDK will reject Init() on launch.");
                return;
            }

            string outputPath = report.summary.outputPath;
            string destDir = target == UnityEditor.BuildTarget.StandaloneOSX
                ? Path.Combine(outputPath, "Contents")   // .app bundle structure
                : Path.GetDirectoryName(outputPath);

            if (string.IsNullOrEmpty(destDir) || !Directory.Exists(destDir))
            {
                Debug.LogWarning($"[SteamBuild] build output directory missing ({destDir}); skipping steam_appid.txt copy.");
                return;
            }

            string dest = Path.Combine(destDir, "steam_appid.txt");
            File.Copy(source, dest, overwrite: true);
            Debug.Log($"[SteamBuild] copied steam_appid.txt → {dest}");
#endif
        }
    }
}
