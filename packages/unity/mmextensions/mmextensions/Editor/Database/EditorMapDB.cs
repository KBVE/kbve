#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using UnityEngine.Networking;
using Unity.EditorCoroutines.Editor;
using System.IO;
using System.Collections;
using System.Collections.Generic;
using Newtonsoft.Json;
using NSprites;
using KBVE.MMExtensions.Orchestrator.DOTS;

namespace KBVE.MMExtensions.Database
{
    public class EditorMapDB : EditorWindow
    {
        private const string ProductionApiUrl = "https://kbve.com/api/resources.json";
        private const string LocalApiUrl = "http://localhost:4321/api/resources.json";
        private const string BaseImageUrl = "https://kbve.com";
        private const string LocalBaseImageUrl = "http://localhost:4321";
        
        private const string SpriteFolder = "Assets/Dungeon/ECS/Resources/MapDB/Sprites/";
        private const string PrefabFolder = "Assets/Dungeon/ECS/Resources/MapDB/Prefabs/";
        private const string TemplateFolder = "Assets/Dungeon/ECS/Resources/Templates/";
        
        private static bool useLocalServer = false;

        [MenuItem("KBVE/Database/Sync MapDB (Production)")]
        public static void SyncMapDatabaseProduction()
        {
            useLocalServer = false;
            EditorCoroutineUtility.StartCoroutineOwnerless(FetchAndGenerate());
        }

        [MenuItem("KBVE/Database/Sync MapDB (Local)")]
        public static void SyncMapDatabaseLocal()
        {
            useLocalServer = true;
            EditorCoroutineUtility.StartCoroutineOwnerless(FetchAndGenerate());
        }

        private static IEnumerator FetchAndGenerate()
        {
            string apiUrl = useLocalServer ? LocalApiUrl : ProductionApiUrl;
            string baseImageUrl = useLocalServer ? LocalBaseImageUrl : BaseImageUrl;
            
            Debug.Log($"Fetching MapDB from: {apiUrl}");
            
            using UnityWebRequest request = UnityWebRequest.Get(apiUrl);
            yield return request.SendWebRequest();

            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError($"Failed to fetch MapDB: {request.error}");
                yield break;
            }

            var wrapper = JsonConvert.DeserializeObject<ResourceListWrapper>(request.downloadHandler.text);
            
            if (wrapper?.resources == null || wrapper.resources.Count == 0)
            {
                Debug.LogWarning("No resources found in MapDB response.");
                yield break;
            }

            Directory.CreateDirectory(SpriteFolder);
            Directory.CreateDirectory(PrefabFolder);

            Debug.Log($"Processing {wrapper.resources.Count} resources...");

            foreach (var resource in wrapper.resources)
            {
                yield return ProcessResource(resource, baseImageUrl);
            }

            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Debug.Log($"MapDB sync complete. Processed {wrapper.resources.Count} resources.");
        }

        private static IEnumerator ProcessResource(ResourceEntry resource, string baseImageUrl)
        {
            Debug.Log($"Processing resource: {resource.name} (ID: {resource.id})");
            
            // Download sprite
            string imageUrl = baseImageUrl + resource.imagePath;
            string imageName = Path.GetFileName(resource.imagePath);
            string localImagePath = Path.Combine(SpriteFolder, imageName);

            using (UnityWebRequest texRequest = UnityWebRequestTexture.GetTexture(imageUrl))
            {
                yield return texRequest.SendWebRequest();

                if (texRequest.result != UnityWebRequest.Result.Success)
                {
                    Debug.LogWarning($"Image download failed for {resource.name}: {imageUrl}");
                    yield break;
                }

                var texture = DownloadHandlerTexture.GetContent(texRequest);
                File.WriteAllBytes(localImagePath, texture.EncodeToPNG());
                Debug.Log($"Saved sprite: {localImagePath}");
            }

            AssetDatabase.ImportAsset(localImagePath, ImportAssetOptions.ForceUpdate);

            // Configure sprite import settings
            TextureImporter importer = (TextureImporter)TextureImporter.GetAtPath(localImagePath);
            if (importer != null)
            {
                importer.textureType = TextureImporterType.Sprite;
                importer.spriteImportMode = SpriteImportMode.Single;
                importer.spritePixelsPerUnit = resource.pixelsPerUnit > 0 ? resource.pixelsPerUnit : 16;
                importer.mipmapEnabled = false;
                importer.alphaIsTransparency = true;
                importer.spritePivot = new Vector2(resource.pivotX, resource.pivotY);
                importer.filterMode = FilterMode.Point; // Pixel-perfect rendering
                importer.textureCompression = TextureImporterCompression.Uncompressed;
                importer.SaveAndReimport();
            }

            var sprite = AssetDatabase.LoadAssetAtPath<Sprite>(localImagePath);
            if (sprite == null)
            {
                Debug.LogError($"Failed to load sprite for {resource.name}");
                yield break;
            }

            // Create or update prefab
            CreateOrUpdateResourcePrefab(resource, sprite);
        }

        private static void CreateOrUpdateResourcePrefab(ResourceEntry resource, Sprite sprite)
        {
            string prefabPath = $"{PrefabFolder}{resource.id}.prefab";
            
            // Delete old prefab if exists (for clean update)
            if (File.Exists(prefabPath))
            {
                AssetDatabase.DeleteAsset(prefabPath);
                Debug.Log($"Deleted old prefab: {prefabPath}");
            }

            // Create new GameObject
            GameObject go = new GameObject(resource.name);

            var spriteRendererAuthoring = go.AddComponent<NSprites.SpriteRendererAuthoring>();
            spriteRendererAuthoring.Sprite = sprite;
            //spriteRendererAuthoring.RegisterSpriteData.SpriteRenderData.Material = "";
            //spriteRendererAuthoring.RegisterSpriteData.SpriteRenderData.PropertiesSet = "";
            // spriteRendererAuthoring.Sorting.SortingLayer = 0;
            spriteRendererAuthoring.Sorting.SortingIndex = 0;
            spriteRendererAuthoring.Sorting.StaticSorting = false;


            // Add ResourceAuthoring component
            var resourceAuthoring = go.AddComponent<ResourceAuthoring>();
            resourceAuthoring.ResourceULID = resource.id;
            resourceAuthoring.Type = ParseResourceType(resource.resourceType);
            resourceAuthoring.Amount = resource.amount;
            resourceAuthoring.MaxAmount = resource.maxAmount;
            resourceAuthoring.HarvestYield = resource.harvestYield;
            resourceAuthoring.HarvestTime = resource.harvestTime;
            resourceAuthoring.IsHarvestable = resource.isHarvestable;
            resourceAuthoring.IsDepleted = resource.isDepleted;

            // Add collider for interaction (optional, adjust as needed)
            var collider = go.AddComponent<BoxCollider2D>();
            collider.isTrigger = false; // Resources are solid objects
            
            // Save as prefab
            GameObject prefab = PrefabUtility.SaveAsPrefabAsset(go, prefabPath);
            GameObject.DestroyImmediate(go);

            if (prefab == null)
            {
                Debug.LogError($"Failed to create prefab for {resource.name}");
                return;
            }

            Debug.Log($"Created prefab: {prefabPath}");

            // Make addressable
            AddressableUtility.MakeAddressable(prefabPath, resource.id, "Resources");
        }

        private static ResourceType ParseResourceType(string type)
        {
            return type.ToLower() switch
            {
                "wood" => ResourceType.Wood,
                "stone" => ResourceType.Stone,
                "metal" => ResourceType.Metal,
                "food" => ResourceType.Food,
                _ => ResourceType.None
            };
        }

        private static bool SortingLayerExists(string name)
        {
            if (string.IsNullOrEmpty(name))
                return false;

        #if UNITY_2022_1_OR_NEWER
            var layers = UnityEngine.SortingLayer.layers;
            foreach (var layer in layers)
            {
                if (layer.name == name)
                    return true;
            }
        #else
            // Fallback for older Unity versions
            System.Type sortingLayerType = typeof(UnityEditorInternal.InternalEditorUtility);
            var sortingLayersProperty = sortingLayerType.GetProperty("sortingLayerNames", System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.NonPublic);
            string[] sortingLayers = (string[])sortingLayersProperty.GetValue(null);
            foreach (string layer in sortingLayers)
            {
                if (layer == name)
                    return true;
            }
        #endif
            return false;
        }
        // === JSON Structures ===

        [System.Serializable]
        public class ResourceListWrapper
        {
            public List<ResourceEntry> resources;
            public Dictionary<string, int> index;
        }

        [System.Serializable]
        public class ResourceEntry
        {
            public string id;
            public string guid;
            public bool drafted;
            public string name;
            public string description;
            public string type;
            public string resourceType;
            public string imagePath;
            public int pixelsPerUnit = 16;
            public float pivotX = 0.5f;
            public float pivotY = 0.5f;
            public string sortingLayer = "Foreground";
            public int sortingIndex = 0;
            public bool staticStoring = true;
            public int amount;
            public int maxAmount;
            public int harvestYield;
            public float harvestTime;
            public bool isHarvestable = true;
            public bool isDepleted = false;
            public float spawnWeight = 1.0f;
            public int? spawnCount;
            public AnimationDataEntry animation;
            public string slug;
        }

        [System.Serializable]
        public class AnimationDataEntry
        {
            public bool hasAnimation;
            public string spriteSheetPath;
            public string defaultClip;
            public List<AnimationClipEntry> clips;
        }

        [System.Serializable]
        public class AnimationClipEntry
        {
            public string id;
            public string name;
            public FrameCountEntry frameCount;
            public FrameRangeEntry frameRange;
            public List<float> frameDurations;
            public bool loop = true;
            public bool playOnStart;
            public int priority;
        }

        [System.Serializable]
        public class FrameCountEntry
        {
            public int x;
            public int y;
        }

        [System.Serializable]
        public class FrameRangeEntry
        {
            public int offset;
            public int count;
        }

        private static int GetSortingIndexForLayer(string layerName)
        {
            return layerName switch
            {
                "Default" => 0,
                "Background" => 1,
                "Ground" => 2,
                "Foreground" => 3,
                _ => 0
            };
        }
    }
}
#endif