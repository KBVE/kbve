using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace RareIcon.EditorTools
{
    /// <summary>Post-build hook that writes a steam_appid.txt next to the shipped executable so the Steamworks SDK can discover the AppID on first launch without a Steam client override. Runs for Windows / macOS / Linux standalone; skipped on every other target since Steamworks.NET isn't linked there. Disabled entirely when the DISABLESTEAMWORKS scripting define is active (dedicated-server builds).</summary>
    /// <remarks>The AppID written is selected by build define: default => 3791950 (Steam demo), <c>RAREICON_MAIN</c> => 2238370 (full game). Demo is the default since it ships first; opt into main with the scripting define when the full release is ready. The project-root steam_appid.txt is irrelevant — what ships with the build is authoritative.</remarks>
    public sealed class SteamBuildPostprocessor : IPostprocessBuildWithReport
    {
        /// <summary>Steamworks AppID for the public RareIcon Demo (separate Steamworks app, queued first).</summary>
        public const string DemoAppId = "3791950";

        /// <summary>Steamworks AppID for the full RareIcon release.</summary>
        public const string MainAppId = "2238370";

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

#if RAREICON_MAIN
            string appId = MainAppId;
            string flavor = "main";
#else
            string appId = DemoAppId;
            string flavor = "demo";
#endif

            string outputPath = report.summary.outputPath;
            string destDir;
            if (target == UnityEditor.BuildTarget.StandaloneOSX)
            {
                string appPath = outputPath.EndsWith(".app") ? outputPath : outputPath + ".app";
                destDir = Path.Combine(appPath, "Contents");
            }
            else
            {
                destDir = Path.GetDirectoryName(outputPath);
            }

            if (string.IsNullOrEmpty(destDir) || !Directory.Exists(destDir))
            {
                Debug.LogWarning($"[SteamBuild] build output directory missing ({destDir}); skipping steam_appid.txt write.");
                return;
            }

            string dest = Path.Combine(destDir, "steam_appid.txt");
            File.WriteAllText(dest, appId + "\n");
            Debug.Log($"[SteamBuild] wrote steam_appid.txt = {appId} ({flavor}) → {dest}");
#endif
        }
    }
}
