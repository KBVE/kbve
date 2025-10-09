using UnityEngine;
using UnityEditor;

namespace KBVE.MMExtensions.Editor.Database
{
    public static class MinionPrefabRegistryEditor
    {
        [MenuItem("KBVE/Database/Minion Prefab Registry")]
        public static void CreateMinionPrefabRegistry()
        {
            // Create the registry asset
            // var registry = ScriptableObject.CreateInstance<KBVE.MMExtensions.Orchestrator.DOTS.MinionPrefabRegistry>();

            // // Generate a unique asset path
            // string path = "Assets/MinionPrefabRegistry.asset";
            // string uniquePath = AssetDatabase.GenerateUniqueAssetPath(path);

            // // Create the asset
            // AssetDatabase.CreateAsset(registry, uniquePath);
            // AssetDatabase.SaveAssets();

            // // Focus on the created asset
            // EditorUtility.FocusProjectWindow();
            // Selection.activeObject = registry;

            //Debug.Log($"[MinionPrefabRegistryEditor] Created MinionPrefabRegistry at: {uniquePath}");
        }
    }
}