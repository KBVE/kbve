using Unity.Entities;
using Unity.Mathematics;
using Unity.Collections;
using Unity.Burst;
using Unity.Jobs;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.Rendering;
using System.Collections.Generic;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{
    /// <summary>
    /// High-performance 2D sprite rendering system using GPU instancing
    /// Batches sprites by texture/material for minimal draw calls
    /// </summary>
    [UpdateInGroup(typeof(PresentationSystemGroup))]
    public partial class Sprite2DRenderSystem : SystemBase
    {
        // Shared quad mesh for all sprites
        private Mesh _quadMesh;

        // Material and texture management
        private Dictionary<int, Material> _materials;
        private Dictionary<int, Texture2D> _spriteTextures;

        // Batching data structures
        private Dictionary<int, List<Matrix4x4>> _batchMatrices;

        // Removed MaterialPropertyBlock to avoid array size issues

        // Constants
        private const int MAX_INSTANCES_PER_BATCH = 1023; // Unity's limit for instancing

        protected override void OnCreate()
        {
            // Create quad mesh for sprites
            _quadMesh = CreateQuadMesh();

            // Initialize collections
            _materials = new Dictionary<int, Material>();
            _spriteTextures = new Dictionary<int, Texture2D>();
            _batchMatrices = new Dictionary<int, List<Matrix4x4>>();

            // Load default sprite material
            LoadDefaultSpriteMaterial();

            // Load sprite textures (in production, load from addressables or resources)
            LoadSpriteTextures();
        }

        protected override void OnUpdate()
        {
            // Clear previous frame's batches
            foreach (var batch in _batchMatrices.Values)
            {
                batch.Clear();
            }

            // Collect sprite data for batching
            Entities
                .WithName("CollectSprites")
                .WithAll<SpriteRenderTag>()
                .ForEach((in LocalToWorld transform, in Sprite2DRenderer sprite) =>
                {
                    // Get or create batch for this sprite type
                    if (!_batchMatrices.ContainsKey(sprite.SpriteID))
                    {
                        _batchMatrices[sprite.SpriteID] = new List<Matrix4x4>();
                    }

                    // Create transform matrix for sprite
                    var position = transform.Position;
                    var rotation = transform.Rotation;
                    var scale = new float3(sprite.Size.x, sprite.Size.y, 1f);

                    var matrix = float4x4.TRS(position, rotation, scale);

                    // Add to batch
                    _batchMatrices[sprite.SpriteID].Add(matrix);
                })
                .WithoutBurst() // Needed for dictionary access
                .Run();

            // Render all batches
            RenderBatches();
        }

        private void RenderBatches()
        {
            var camera = Camera.main;
            if (camera == null) return;

            // Process each sprite type batch
            foreach (var kvp in _batchMatrices)
            {
                int spriteID = kvp.Key;
                var matrices = kvp.Value;

                if (matrices.Count == 0) continue;

                // Get material for this sprite type - try to get specific material first
                if (!_materials.TryGetValue(spriteID, out Material material))
                {
                    // Fallback to default material
                    if (!_materials.TryGetValue(0, out material))
                        continue;
                }

                // Set the appropriate texture for this sprite type
                if (_spriteTextures.TryGetValue(spriteID, out Texture2D texture))
                {
                    material.mainTexture = texture;
                }

                // Process in chunks if exceeding max instances
                int batchCount = Mathf.CeilToInt((float)matrices.Count / MAX_INSTANCES_PER_BATCH);

                for (int batchIndex = 0; batchIndex < batchCount; batchIndex++)
                {
                    int startIndex = batchIndex * MAX_INSTANCES_PER_BATCH;
                    int count = Mathf.Min(MAX_INSTANCES_PER_BATCH, matrices.Count - startIndex);

                    // Create arrays for this batch
                    var batchMatrixArray = new Matrix4x4[count];
                    for (int i = 0; i < count; i++)
                    {
                        batchMatrixArray[i] = matrices[startIndex + i];
                    }

                    // Use simple instancing without property blocks to avoid array size issues
                    Graphics.DrawMeshInstanced(
                        _quadMesh,
                        0,
                        material,
                        batchMatrixArray,
                        count,
                        null, // No property block for now
                        ShadowCastingMode.Off,
                        false,
                        0, // Default layer
                        camera
                    );
                }
            }
        }

        private Mesh CreateQuadMesh()
        {
            var mesh = new Mesh();
            mesh.name = "Sprite Quad";

            // Vertices for a centered quad
            var vertices = new Vector3[]
            {
                new Vector3(-0.5f, -0.5f, 0),
                new Vector3(0.5f, -0.5f, 0),
                new Vector3(0.5f, 0.5f, 0),
                new Vector3(-0.5f, 0.5f, 0)
            };

            // UV coordinates
            var uvs = new Vector2[]
            {
                new Vector2(0, 0),
                new Vector2(1, 0),
                new Vector2(1, 1),
                new Vector2(0, 1)
            };

            // Triangles (two triangles make a quad)
            var triangles = new int[]
            {
                0, 2, 1,
                0, 3, 2
            };

            mesh.vertices = vertices;
            mesh.uv = uvs;
            mesh.triangles = triangles;
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();

            return mesh;
        }

        private void LoadDefaultSpriteMaterial()
        {
            // Try to load from Resources or create a simple unlit material
            var shader = Shader.Find("Sprites/Default") ?? Shader.Find("Unlit/Transparent") ?? Shader.Find("Unlit/Texture");
            if (shader != null)
            {
                // Create a default material
                var defaultMaterial = new Material(shader);
                defaultMaterial.name = "Default Sprite Material";
                defaultMaterial.enableInstancing = true;
                _materials[0] = defaultMaterial;

                // Create materials for each sprite type
                for (int i = 0; i < 5; i++)
                {
                    var material = new Material(shader);
                    material.name = $"Sprite Material {i}";
                    material.enableInstancing = true;
                    _materials[i] = material;
                }

                Debug.Log($"[Sprite2DRenderSystem] Created materials with shader: {shader.name}");
            }
            else
            {
                Debug.LogError("[Sprite2DRenderSystem] Could not find any sprite shader!");
            }
        }

        private void LoadSpriteTextures()
        {
            // In production, load these from addressables or resources
            // For now, create placeholder textures
            for (int i = 0; i < 5; i++)
            {
                var tex = new Texture2D(32, 32);
                var colors = new Color32[32 * 32];

                // Create different colored squares for testing
                Color32 color = i switch
                {
                    0 => new Color32(255, 0, 0, 255), // Red for Tank/Zombie
                    1 => new Color32(0, 255, 0, 255), // Green for Fast
                    2 => new Color32(0, 0, 255, 255), // Blue for Ranged
                    3 => new Color32(255, 255, 0, 255), // Yellow for Flying
                    4 => new Color32(255, 0, 255, 255), // Magenta for Boss
                    _ => new Color32(255, 255, 255, 255) // White default
                };

                for (int j = 0; j < colors.Length; j++)
                {
                    colors[j] = color;
                }

                tex.SetPixels32(colors);
                tex.Apply();
                _spriteTextures[i] = tex;
            }

            // Set textures on their respective materials
            foreach (var kvp in _spriteTextures)
            {
                int spriteID = kvp.Key;
                var texture = kvp.Value;

                if (_materials.TryGetValue(spriteID, out Material mat))
                {
                    mat.mainTexture = texture;
                    Debug.Log($"[Sprite2DRenderSystem] Set texture for sprite {spriteID}");
                }
            }
        }


        protected override void OnDestroy()
        {
            // Clean up meshes
            if (_quadMesh != null)
            {
                UnityEngine.Object.DestroyImmediate(_quadMesh);
            }

            // Clean up materials
            foreach (var mat in _materials.Values)
            {
                if (mat != null)
                {
                    UnityEngine.Object.DestroyImmediate(mat);
                }
            }

            // Clean up textures
            foreach (var tex in _spriteTextures.Values)
            {
                if (tex != null)
                {
                    UnityEngine.Object.DestroyImmediate(tex);
                }
            }
        }
    }
}