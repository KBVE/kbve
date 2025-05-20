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

        private static Texture2D _cachedLogo;

        public static Texture2D LoadKbveLogo()
        {
            if (_cachedLogo != null)
                return _cachedLogo;

            // Try loading from Assets
            _cachedLogo = AssetDatabase.LoadAssetAtPath<Texture2D>(LogoPathInProject);
            if (_cachedLogo != null)
                return _cachedLogo;

            // Try downloading and saving to Assets
            try
            {
                using WebClient client = new();
                byte[] imageData = client.DownloadData(RemoteLogoURL);

                Directory.CreateDirectory("Assets/Dungeon/Data/Logo");
                File.WriteAllBytes(LogoPathInProject, imageData);
                AssetDatabase.ImportAsset(LogoPathInProject);

                _cachedLogo = AssetDatabase.LoadAssetAtPath<Texture2D>(LogoPathInProject);
                Debug.Log("[EditorSupport] Downloaded and saved KBVE logo to project.");
                return _cachedLogo;
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[EditorSupport] Failed to download KBVE logo: {ex.Message}");
                return null;
            }
        }
    }
}
