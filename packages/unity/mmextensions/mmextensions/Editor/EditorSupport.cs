using System;
using System.IO;
using System.Net;
using UnityEditor;
using UnityEngine;

namespace KBVE.MMExtensions.Editor
{
    public static class EditorSupport
    {
        private const string RemoteLogoURL = "https://kbve.com/assets/img/letter_logo.png";
        private const string LogoPathInProject = "Assets/Dungeon/Data/Logo/kbve.png";
        private const string LogoTimestampKey = "kbve.logo.timestamp";

        private static Texture2D _cachedLogo;

        /// <summary>
        /// Loads the KBVE logo from disk or downloads it if missing. Automatically imports and sets texture settings.
        /// </summary>
        public static Texture2D LoadKbveLogo()
        {
            if (_cachedLogo != null)
                return _cachedLogo;

            _cachedLogo = AssetDatabase.LoadAssetAtPath<Texture2D>(LogoPathInProject);
            if (_cachedLogo != null)
                return _cachedLogo;

            try
            {
                using WebClient client = new();
                byte[] imageData = client.DownloadData(RemoteLogoURL);

                Directory.CreateDirectory(Path.GetDirectoryName(LogoPathInProject)!);
                File.WriteAllBytes(LogoPathInProject, imageData);
                AssetDatabase.ImportAsset(LogoPathInProject);

                // Post-import: Apply proper texture settings for GUI use
                ApplyTextureImportSettings();

                _cachedLogo = AssetDatabase.LoadAssetAtPath<Texture2D>(LogoPathInProject);
                EditorPrefs.SetString(LogoTimestampKey, DateTime.UtcNow.ToString("o"));

                Debug.Log("[EditorSupport] Downloaded and imported KBVE logo.");
                return _cachedLogo;
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[EditorSupport] Failed to download KBVE logo: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Applies ideal import settings for the logo texture (for GUI).
        /// </summary>
        private static void ApplyTextureImportSettings()
        {
            var importer = AssetImporter.GetAtPath(LogoPathInProject) as TextureImporter;
            if (importer == null) return;

            importer.textureType = TextureImporterType.GUI;
            importer.alphaIsTransparency = true;
            importer.mipmapEnabled = false;
            importer.isReadable = true;

            importer.SaveAndReimport();
        }

        /// <summary>
        /// Force refreshes the cached logo. Can be called from a menu or editor utility.
        /// </summary>
        [MenuItem("KBVE/Force Logo Refresh")]
        public static void ForceDownloadKbveLogo()
        {
            _cachedLogo = null;

            if (File.Exists(LogoPathInProject))
            {
                File.Delete(LogoPathInProject);
                AssetDatabase.Refresh();
                Debug.Log("[EditorSupport] Old logo deleted.");
            }

            LoadKbveLogo();
        }

        /// <summary>
        /// Returns the last download timestamp for the logo (UTC ISO8601).
        /// </summary>
        public static string GetLastDownloadTimestamp()
        {
            return EditorPrefs.GetString(LogoTimestampKey, "never");
        }


         /// <summary>
        /// Draws standardized KBVE help buttons for Discord and GitHub support.
        /// </summary>
        public static void DrawSupportButtons()
        {
            Texture2D logo = LoadKbveLogo();

            GUILayout.BeginVertical("box");
            GUILayout.Label("Need Help?", EditorStyles.boldLabel);

            DrawHelpButton(logo, "Ask Fudster", "https://kbve.com/discord/");
            GUILayout.Space(4);
            DrawHelpButton(logo, "Report an Error", "https://github.com/KBVE/kbve/issues/new?template=unity_report.md");

            GUILayout.EndVertical();
        }

        private static void DrawHelpButton(Texture2D logo, string label, string url)
        {
            GUILayout.BeginHorizontal();

           if (logo != null)
            {
                float scale = 1.0f;
                float logoWidth = logo.width * scale;
                float logoHeight = logo.height * scale;
                GUILayout.Label(logo, GUILayout.Width(logoWidth), GUILayout.Height(logoHeight));
            }

            if (GUILayout.Button(label, GUILayout.Height(24)))
                Application.OpenURL(url);

            GUILayout.EndHorizontal();
        }
    }
}
