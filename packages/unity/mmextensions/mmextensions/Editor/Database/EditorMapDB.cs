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

            if (wrapper == null || wrapper.Items == null || wrapper.Items.Count == 0)
            {
                Debug.LogWarning("No resources found in MapDB response.");
                yield break;
            }

            Directory.CreateDirectory(SpriteFolder);
            Directory.CreateDirectory(PrefabFolder);

            Debug.Log($"Processing {wrapper.Items.Count} resources...");
            foreach (var resource in wrapper.Items)
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
                
                // Pixels per unit
                importer.spritePixelsPerUnit = resource.pixelsPerUnit > 0 ? resource.pixelsPerUnit : 16;
                
                // Mesh type (FullRect | Tight) from schema
                //importer.spriteMeshType = ParseSpriteMeshType(resource.meshType);
                var settings = new TextureImporterSettings();
                importer.ReadTextureSettings(settings);
                settings.spriteMeshType = ParseSpriteMeshType(resource.meshType);
                importer.SetTextureSettings(settings);

                // Extrude edges (pixels) from schema (default 1)
                importer.spriteExtrude = Mathf.Max(0, resource.extrudeEdges);

                // Wrap Mode
                importer.wrapMode = ParseWrapMode(resource.wrapMode);


                importer.spriteAlignment = ParseSpriteAlignment(resource.pivot);
                if (importer.spriteAlignment == (int)SpriteAlignment.Custom)
                    importer.spritePivot = new Vector2(resource.pivotX, resource.pivotY);

                importer.mipmapEnabled = false;
                importer.alphaIsTransparency = true;
                //importer.spritePivot = new Vector2(resource.pivotX, resource.pivotY);
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
            //string prefabPath = $"{PrefabFolder}{resource.id}.prefab";
            string sanitizedName = resource.name.ToLower().Replace(" ", "-");
            string prefabPath = $"{PrefabFolder}{sanitizedName}.prefab";
    
            if (File.Exists(prefabPath))
            {
                AssetDatabase.DeleteAsset(prefabPath);
                Debug.Log($"Deleted old prefab: {prefabPath}");
            }

            // Load and instantiate template
            GameObject template = AssetDatabase.LoadAssetAtPath<GameObject>($"{TemplateFolder}ResourceTemplate.prefab");
            if (template == null)
            {
                Debug.LogError("ResourceTemplate.prefab not found at: " + TemplateFolder + "ResourceTemplate.prefab");
                Debug.LogError("Create a template prefab with SpriteRendererAuthoring and ResourceAuthoring configured.");
                return;
            }
            
            GameObject go = GameObject.Instantiate(template);
            go.name = resource.name;
            
            // Update NSprites sprite and sorting
            var spriteRendererAuthoring = go.GetComponent<SpriteRendererAuthoring>();
            if (spriteRendererAuthoring != null)
            {
                spriteRendererAuthoring.Sprite = sprite;
                spriteRendererAuthoring.Sorting.SortingLayer = GetSortingLayerID(resource.sortingLayer);
                spriteRendererAuthoring.Sorting.SortingIndex = resource.sortingIndex;
                spriteRendererAuthoring.Sorting.StaticSorting = resource.staticSorting;
            }
            else
            {
                Debug.LogWarning($"Template missing SpriteRendererAuthoring component for {resource.name}");
            }

            // Update ResourceAuthoring
            var resourceAuthoring = go.GetComponent<ResourceAuthoring>();
            if (resourceAuthoring != null)
            {
                resourceAuthoring.ResourceULID = resource.id;
                resourceAuthoring.Type = ParseResourceType(resource.resourceType);
                resourceAuthoring.Amount = resource.amount;
                resourceAuthoring.MaxAmount = resource.maxAmount;
                resourceAuthoring.HarvestYield = resource.harvestYield;
                resourceAuthoring.HarvestTime = resource.harvestTime;
                resourceAuthoring.IsHarvestable = resource.isHarvestable;
                resourceAuthoring.IsDepleted = resource.isDepleted;
            }
            else
            {
                Debug.LogWarning($"Template missing ResourceAuthoring component for {resource.name}");
            }
            
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

        // Parse Sprite Mesh Type
        private static SpriteMeshType ParseSpriteMeshType(string meshType)
        {
            if (string.IsNullOrEmpty(meshType))
                return SpriteMeshType.FullRect;

            switch (meshType.Trim().ToLowerInvariant())
            {
                case "tight":    return SpriteMeshType.Tight;
                case "fullrect": return SpriteMeshType.FullRect;
                default:         return SpriteMeshType.FullRect;
            }
        }
        // Helper function for Sprite Alignment

        private static SpriteAlignment ParseSpriteAlignment(string pivot)
        {
            if (string.IsNullOrEmpty(pivot)) return SpriteAlignment.Center;

            switch (pivot.ToLowerInvariant())
            {
                case "topleft": return SpriteAlignment.TopLeft;
                case "top": return SpriteAlignment.TopCenter;
                case "topright": return SpriteAlignment.TopRight;
                case "left": return SpriteAlignment.LeftCenter;
                case "center": return SpriteAlignment.Center;
                case "right": return SpriteAlignment.RightCenter;
                case "bottomleft": return SpriteAlignment.BottomLeft;
                case "bottom": return SpriteAlignment.BottomCenter;
                case "bottomright": return SpriteAlignment.BottomRight;
                case "custom": return SpriteAlignment.Custom;
                default: return SpriteAlignment.Center;
            }
        }

        private static TextureWrapMode ParseWrapMode(string wrap)
        {
            if (string.IsNullOrEmpty(wrap)) return TextureWrapMode.Clamp;

            switch (wrap.Trim().ToLowerInvariant())
            {
                case "repeat":      return TextureWrapMode.Repeat;
                case "clamp":       return TextureWrapMode.Clamp;
                case "mirror":      return TextureWrapMode.Mirror;
                case "mirroronce":  return TextureWrapMode.MirrorOnce;
                default:            return TextureWrapMode.Clamp;
            }
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
            // Legacy payload
            public List<ResourceEntry> resources;
            // New payload (your current JSON)
            public List<ResourceEntry> mapObjects;

            public Dictionary<string, int> index;

            [Newtonsoft.Json.JsonIgnore]
            public List<ResourceEntry> Items => mapObjects ?? resources ?? new List<ResourceEntry>();
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
            public string pivot = "Center";
            public float pivotX = 0.5f;
            public float pivotY = 0.5f;            
            public string meshType = "FullRect";   // Added — matches SpriteMeshTypeEnum
            public int extrudeEdges = 1;           // Added — pixel extrusion for sprite edges
            public string wrapMode = "Clamp";      // Added — matches TextureWrapModeEnum
            public string sortingLayer = "Foreground";
            public int sortingIndex = 0;
            public bool staticSorting = false;
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

        // private static int GetSortingIndexForLayer(string layerName)
        // {
        //     return layerName switch
        //     {
        //         "Default" => 0,
        //         "Background" => 1,
        //         "Ground" => 2,
        //         "Foreground" => 3,
        //         _ => 0
        //     };
        // }

        private static int GetSortingLayerID(string layerName)
        {
            if (string.IsNullOrEmpty(layerName))
                return 0;

            try
            {
                // Try modern public API first (Unity 2021+)
                var nameToID = typeof(UnityEngine.SortingLayer).GetMethod(
                    "NameToID",
                    System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.Public
                );
                if (nameToID != null)
                {
                    int id = (int)nameToID.Invoke(null, new object[] { layerName });
                    if (id != 0)
                        return id;
                }

                // Fallback for older Unity (access internal editor data)
                var internalUtil = typeof(UnityEditorInternal.InternalEditorUtility);
                var sortingLayerNamesProp = internalUtil.GetProperty(
                    "sortingLayerNames",
                    System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.NonPublic
                );
                var sortingLayerUniqueIDsProp = internalUtil.GetProperty(
                    "sortingLayerUniqueIDs",
                    System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.NonPublic
                );

                if (sortingLayerNamesProp != null && sortingLayerUniqueIDsProp != null)
                {
                    string[] names = (string[])sortingLayerNamesProp.GetValue(null);
                    int[] ids = (int[])sortingLayerUniqueIDsProp.GetValue(null);
                    for (int i = 0; i < names.Length; i++)
                    {
                        if (names[i] == layerName)
                            return ids[i];
                    }
                }
            }
            catch (System.Exception ex)
            {
                Debug.LogWarning($"GetSortingLayerID failed: {ex.Message}");
            }

            Debug.LogWarning($"Sorting layer '{layerName}' not found, using Default.");
            return 0;
        }



    }
}
#endif