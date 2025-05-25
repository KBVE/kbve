using UnityEditor;
using UnityEngine;
using UnityEngine.Networking;
using Unity.EditorCoroutines.Editor;
using System.IO;
using System.Collections;
using System.Collections.Generic;

namespace KBVE.MMExtensions.Database
{
    public class EditorItemDB : EditorWindow
    {
        private const string ApiUrl = "https://kbve.com/api/itemdb.json";
        private const string BaseImageUrl = "https://kbve.com";
        private const string SpriteFolder = "Assets/Dungeon/Data/Items/Sprites/";
        private const string PrefabFolder = "Assets/Dungeon/Data/Items/Prefabs/";

        [MenuItem("KBVE/Database/Sync ItemDB")]
        public static void SyncItemDatabase()
        {
            EditorCoroutineUtility.StartCoroutineOwnerless(FetchAndGenerate());
        }

        private static IEnumerator FetchAndGenerate()
        {
            using UnityWebRequest request = UnityWebRequest.Get(ApiUrl);
            yield return request.SendWebRequest();

            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError($"Failed to fetch ItemDB: {request.error}");
                yield break;
            }

            var wrapper = JsonUtility.FromJson<ItemListWrapper>(request.downloadHandler.text);

            Directory.CreateDirectory(SpriteFolder);
            Directory.CreateDirectory(PrefabFolder);

            foreach (var item in wrapper.items)
            {
                string imageUrl = BaseImageUrl + item.img;
                string imageName = Path.GetFileName(item.img);
                string localImagePath = Path.Combine(SpriteFolder, imageName);

                // Download image
                using (UnityWebRequest texRequest = UnityWebRequestTexture.GetTexture(imageUrl))
                {
                    yield return texRequest.SendWebRequest();

                    if (texRequest.result != UnityWebRequest.Result.Success)
                    {
                        Debug.LogWarning($"Image download failed: {imageUrl}");
                        continue;
                    }

                    var texture = DownloadHandlerTexture.GetContent(texRequest);
                    File.WriteAllBytes(localImagePath, texture.EncodeToPNG());
                    Debug.Log($"Saved sprite: {localImagePath}");
                }

                AssetDatabase.ImportAsset(localImagePath, ImportAssetOptions.ForceUpdate);

                // Import settings
                TextureImporter importer = (TextureImporter)TextureImporter.GetAtPath(localImagePath);
                importer.textureType = TextureImporterType.Sprite;
                importer.spritePixelsPerUnit = item.pixelDensity > 0 ? item.pixelDensity : 16;
                importer.spriteImportMode = SpriteImportMode.Single;
                importer.mipmapEnabled = false;
                importer.alphaIsTransparency = true;
                importer.spritePivot = new Vector2(0.5f, 0.5f);
                importer.spriteMeshType = SpriteMeshType.FullRect;
                importer.SaveAndReimport();

                // Create prefab
                GameObject go = new GameObject(item.name);
                var data = go.AddComponent<ItemData>();
                data.Apply(item);

                var sprite = AssetDatabase.LoadAssetAtPath<Sprite>(localImagePath);
                var renderer = go.AddComponent<SpriteRenderer>();
                renderer.sprite = sprite;

                if (item.scripts != null)
                {
                    foreach (var script in item.scripts)
                    {
                        string scriptPath = AssetDatabase.GUIDToAssetPath(script.guid);
                        var monoScript = AssetDatabase.LoadAssetAtPath<MonoScript>(scriptPath);
                        var type = monoScript?.GetClass();
                        if (type != null)
                        {
                            var comp = go.AddComponent(type);
                            ApplyScriptVariables(comp, script.vars);
                        }
                    }
                }

                string prefabPath = Path.Combine(PrefabFolder, item.name + ".prefab");
                PrefabUtility.SaveAsPrefabAsset(go, prefabPath);
                GameObject.DestroyImmediate(go);
            }

            AssetDatabase.Refresh();
            Debug.Log("ItemDB sync complete.");
        }

        private static void ApplyScriptVariables(Component comp, Dictionary<string, object> vars)
        {
            if (comp == null || vars == null) return;

            var type = comp.GetType();
            foreach (var kvp in vars)
            {
                var field = type.GetField(kvp.Key);
                if (field != null)
                {
                    try
                    {
                        object converted = System.Convert.ChangeType(kvp.Value, field.FieldType);
                        field.SetValue(comp, converted);
                    }
                    catch
                    {
                        Debug.LogWarning($"Failed to apply var '{kvp.Key}' on {type.Name}");
                    }
                }
            }
        }

        // === JSON Structures ===

        [System.Serializable]
        public class ItemListWrapper
        {
            public List<ItemEntry> items;
        }

        [System.Serializable]
        public class ItemEntry
        {
            public string id;
            public int key;
            public string @ref;
            public string name;
            public string type;
            public int category;
            public string description;
            public string img;

            public int pixelDensity;
            public Bonuses bonuses;
            public float durability;
            public float weight;
            public bool equipped;
            public bool consumable;
            public string effects;
            public bool stackable;
            public string rarity;
            public int levelRequirement;
            public int price;
            public float cooldown;
            public string action;
            public string credits;
            public string slug;
            public List<ScriptEntry> scripts;
        }

        [System.Serializable]
        public class Bonuses
        {
            public float health;
        }

        [System.Serializable]
        public class ScriptEntry
        {
            public string guid;
            public Dictionary<string, object> vars;
        }
    }
}
