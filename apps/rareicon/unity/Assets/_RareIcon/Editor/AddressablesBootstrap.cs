using System.IO;
using UnityEditor;
using UnityEditor.AddressableAssets;
using UnityEditor.AddressableAssets.Settings;
using UnityEngine;

namespace RareIcon.EditorTools
{
    /// <summary>Creates AddressableAssetSettings on first editor load if missing so Entities Graphics / Netcode subscene baking does not spam "Addressable Asset Settings does not exist. Failed to create." in batchmode CI builds.</summary>
    [InitializeOnLoad]
    public static class AddressablesBootstrap
    {
        const string SettingsFolder = "Assets/AddressableAssetsData";
        const string SettingsName = "AddressableAssetSettings";

        static AddressablesBootstrap()
        {
            EditorApplication.delayCall += TryEnsureSettings;
        }

        static void TryEnsureSettings()
        {
            EditorApplication.delayCall -= TryEnsureSettings;
            if (Application.isBatchMode) return;
            if (EditorApplication.isCompiling || EditorApplication.isUpdating) return;
            if (AddressableAssetSettingsDefaultObject.Settings != null) return;

            if (!AssetDatabase.IsValidFolder(SettingsFolder))
                AssetDatabase.CreateFolder("Assets", "AddressableAssetsData");

            string path = Path.Combine(SettingsFolder, SettingsName + ".asset");
            var settings = AssetDatabase.LoadAssetAtPath<AddressableAssetSettings>(path);
            if (settings == null)
            {
                try { settings = AddressableAssetSettings.Create(SettingsFolder, SettingsName, true, true); }
                catch { return; }
            }
            if (settings == null) return;
            AddressableAssetSettingsDefaultObject.Settings = settings;
            AssetDatabase.SaveAssets();
        }
    }
}
