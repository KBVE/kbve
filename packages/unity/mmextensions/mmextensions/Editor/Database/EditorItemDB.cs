using UnityEditor;
using UnityEngine;
using UnityEngine.Networking;
using Unity.EditorCoroutines.Editor;
using System.IO;
using System.Collections;
using System.Collections.Generic;
using MoreMountains.InventoryEngine;
using MoreMountains.Tools;
using MoreMountains.Feedbacks;

namespace KBVE.MMExtensions.Database
{
    public class EditorItemDB : EditorWindow
    {
        private const string ApiUrl = "https://kbve.com/api/itemdb.json";
        private const string BaseImageUrl = "https://kbve.com";
        private const string SpriteFolder = "Assets/Dungeon/Data/Items/Sprites/";
        private const string PrefabFolder = "Assets/Dungeon/Data/Items/Prefabs/";
        private const string ItemAssetFolder = "Assets/Dungeon/Data/Items/Definitions/";

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
            Directory.CreateDirectory(ItemAssetFolder);

            foreach (var item in wrapper.items)
            {
                string imageUrl = BaseImageUrl + item.img;
                string imageName = Path.GetFileName(item.img);
                string localImagePath = Path.Combine(SpriteFolder, imageName);

                // Download sprite
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

                // Sprite import settings
                TextureImporter importer = (TextureImporter)TextureImporter.GetAtPath(localImagePath);
                importer.textureType = TextureImporterType.Sprite;
                importer.spriteImportMode = SpriteImportMode.Single;
                importer.spritePixelsPerUnit = item.pixelDensity > 0 ? item.pixelDensity : 16;
                importer.mipmapEnabled = false;
                importer.alphaIsTransparency = true;
                importer.spritePivot = new Vector2(0.5f, 0.5f);
                importer.spriteMeshType = SpriteMeshType.FullRect;
                importer.SaveAndReimport();

                var sprite = AssetDatabase.LoadAssetAtPath<Sprite>(localImagePath);

                // Create or update InventoryItem asset
                var invItem = CreateOrUpdateInventoryItem(item, sprite);

                // Create DropPrefab
                var dropPrefab = CreateItemPrefab(item.name + "_Drop", sprite, invItem.ItemID, false);

                // Create DeployablePrefab if it's deployable
                GameObject deployPrefab = null;
                if ((item.category & 0x00000400) != 0) // Example: Structure flag
                {
                    deployPrefab = CreateItemPrefab(item.name + "_Deploy", sprite, invItem.ItemID, true);
                }

                // Assign prefabs
                invItem.Prefab = dropPrefab;
                EditorUtility.SetDirty(invItem);
            }

            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Debug.Log("ItemDB sync complete.");
        }

        private static InventoryItem CreateOrUpdateInventoryItem(ItemEntry item, Sprite icon)
        {
            string assetPath = $"{ItemAssetFolder}{item.id}.asset";
            InventoryItem invItem = AssetDatabase.LoadAssetAtPath<InventoryItem>(assetPath);

            if (invItem == null)
            {
                invItem = ScriptableObject.CreateInstance<InventoryItem>();
                AssetDatabase.CreateAsset(invItem, assetPath);
            }

            invItem.ItemID = item.id;
            invItem.ItemName = item.name;
            invItem.ShortDescription = item.description;
            invItem.Description = item.effects;
            invItem.Icon = icon;
            invItem.Consumable = item.consumable;
            invItem.Usable = item.consumable || item.action == "consume";
            invItem.ConsumeQuantity = 1;
            invItem.Equippable = (item.category & 0x00000001) != 0; // Weapon
            invItem.Stackable = item.stackable;
            invItem.MaximumStack = item.stackable ? 99 : 1;
            invItem.Price = item.price;
            invItem.TargetInventoryName = "MainInventory";
            invItem.Droppable = true;

            return invItem;
        }

        private static GameObject CreateItemPrefab(string name, Sprite sprite, string itemID, bool isDeployable)
        {
            GameObject go = new GameObject(name);
            var renderer = go.AddComponent<SpriteRenderer>();
            renderer.sprite = sprite;

            var picker = go.AddComponent<ItemPicker>();
            picker.ItemID = itemID;
            picker.Quantity = 1;

            string prefabPath = $"{PrefabFolder}{name}.prefab";
            PrefabUtility.SaveAsPrefabAsset(go, prefabPath);
            GameObject.DestroyImmediate(go);
            return AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
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
