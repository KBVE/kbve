#if UNITY_EDITOR
using UnityEditor;
using UnityEditor.AddressableAssets;
using UnityEditor.AddressableAssets.Settings;
#endif

using UnityEngine;

namespace KBVE.MMExtensions.Database
{
    public static class AddressableUtility
    {
#if UNITY_EDITOR
        public static void MakeAddressable(string assetPath, string addressKey, string groupName = "Default Local Group")
        {
            string guid = AssetDatabase.AssetPathToGUID(assetPath);
            if (string.IsNullOrEmpty(guid)) return;

            var settings = AddressableAssetSettingsDefaultObject.Settings;
            if (settings == null) return;

            var group = settings.FindGroup(groupName);
            
            if (group == null)
            {
                group = settings.CreateGroup(groupName, false, false, false, null,
                    new[] { typeof(UnityEditor.AddressableAssets.Settings.GroupSchemas.BundledAssetGroupSchema) });
            }

            var entry = settings.FindAssetEntry(guid);

            if (entry == null)
            {
                entry = settings.CreateOrMoveEntry(guid, group);
            }

            entry.address = addressKey;
            EditorUtility.SetDirty(settings);
        }
#endif
    }
}
