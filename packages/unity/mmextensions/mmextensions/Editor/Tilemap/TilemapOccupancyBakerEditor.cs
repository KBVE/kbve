using UnityEditor;
using UnityEngine;
using KBVE.MMExtensions.Map;

namespace KBVE.MMExtensions.Editor.Tilemap
{
    [CustomEditor(typeof(TilemapOccupancyBaker))]
    public class TilemapOccupancyBakerEditor : UnityEditor.Editor
    {
        public override void OnInspectorGUI()
        {
            base.OnInspectorGUI();

            EditorGUILayout.Space();

            var baker = (TilemapOccupancyBaker)target;

            EditorGUILayout.Space();
            if (GUILayout.Button("Bake Tile Occupancy Map"))
            {

                    if (baker.outputData == null)
                        {
                            string sceneName = baker.gameObject.scene.name;
                            string objectName = baker.gameObject.name;

                            string folderPath = EditorSupport.EnsureUnityAssetPath("Assets/Dungeon/Data/OccupancyMaps");

                            string fileName = $"{sceneName}_{objectName}_occupancy.asset";
                            string fullPath = Path.Combine(folderPath, fileName).Replace("\\", "/");

                            if (File.Exists(fullPath))
                            {
                                string timestamp = System.DateTime.Now.ToString("yyyyMMdd_HHmmss");
                                fileName = $"{sceneName}_{objectName}_occupancy_{timestamp}.asset";
                                fullPath = Path.Combine(folderPath, fileName).Replace("\\", "/");
                            }

                            var data = ScriptableObject.CreateInstance<TilemapOccupancyData>();
                            AssetDatabase.CreateAsset(data, fullPath);
                            AssetDatabase.SaveAssets();

                            baker.outputData = data;

                            Debug.Log($"[TilemapOccupancyBakerEditor] Created outputData asset at: {fullPath}");
                        }

                baker.Bake();
            }

            EditorGUILayout.Space(12);
            EditorSupport.DrawSupportButtons();

            EditorGUILayout.Space();
            EditorGithubIssues.DrawUnityIssues();
        }
    }
}

