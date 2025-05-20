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
                baker.Bake();
            }

            EditorGUILayout.Space(12);
            EditorSupport.DrawSupportButtons();

            EditorGUILayout.Space();
            EditorGithubIssues.DrawUnityIssues();
        }
    }
}

