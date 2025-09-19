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
        private Dictionary<int, List<Vector4>> _batchUVs;
        private Dictionary<int, List<Vector4>> _batchColors;

        // Material property blocks for instancing
        private MaterialPropertyBlock _propertyBlock;

        // Constants
        private const int MAX_INSTANCES_PER_BATCH = 1023; // Unity's limit for instancing
        private static readonly int _MainTexProperty = Shader.PropertyToID("_MainTex");
        private static readonly int _ColorProperty = Shader.PropertyToID("_Color");
        private static readonly int _UVProperty = Shader.PropertyToID("_UV");

        protected override void OnCreate()
        {
            // Create quad mesh for sprites
            _quadMesh = CreateQuadMesh();

            // Initialize collections
            _materials = new Dictionary<int, Material>();
            _spriteTextures = new Dictionary<int, Texture2D>();
            _batchMatrices = new Dictionary<int, List<Matrix4x4>>();
            _batchUVs = new Dictionary<int, List<Vector4>>();
            _batchColors = new Dictionary<int, List<Vector4>>();
            _propertyBlock = new MaterialPropertyBlock();

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
            foreach (var batch in _batchUVs.Values)
            {
                batch.Clear();
            }
            foreach (var batch in _batchColors.Values)
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
                        _batchUVs[sprite.SpriteID] = new List<Vector4>();
                        _batchColors[sprite.SpriteID] = new List<Vector4>();
                    }

                    // Create transform matrix for sprite
                    var position = transform.Position;
                    var rotation = transform.Rotation;
                    var scale = new float3(sprite.Size.x, sprite.Size.y, 1f);

                    var matrix = float4x4.TRS(position, rotation, scale);

                    // Add to batch
                    _batchMatrices[sprite.SpriteID].Add(matrix);
                    _batchUVs[sprite.SpriteID].Add(GetUVForSprite(sprite.SpriteID));
                    _batchColors[sprite.SpriteID].Add(sprite.Color);
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

                // Get material for this sprite type
                if (!_materials.TryGetValue(0, out Material material)) // Using default material for now
                    continue;

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

                    // Set material properties if we have custom UV/colors
                    if (_batchUVs.ContainsKey(spriteID) && _batchColors.ContainsKey(spriteID))
                    {
                        var uvs = _batchUVs[spriteID];
                        var colors = _batchColors[spriteID];

                        // Create arrays for GPU
                        var uvArray = new Vector4[count];
                        var colorArray = new Vector4[count];

                        for (int i = 0; i < count; i++)
                        {
                            uvArray[i] = uvs[startIndex + i];
                            colorArray[i] = colors[startIndex + i];
                        }

                        _propertyBlock.SetVectorArray(_UVProperty, uvArray);
                        _propertyBlock.SetVectorArray(_ColorProperty, colorArray);
                    }

                    // Draw instanced mesh
                    Graphics.DrawMeshInstanced(
                        _quadMesh,
                        0,
                        material,
                        batchMatrixArray,
                        count,
                        _propertyBlock,
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
            var shader = Shader.Find("Sprites/Default") ?? Shader.Find("Unlit/Transparent");
            if (shader != null)
            {
                var material = new Material(shader);
                material.name = "Sprite Instance Material";
                material.enableInstancing = true;
                _materials[0] = material;
            }
            else
            {
                Debug.LogError("[Sprite2DRenderSystem] Could not find sprite shader!");
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

            // Set the texture on the material
            if (_materials.TryGetValue(0, out Material mat) && _spriteTextures.Count > 0)
            {
                // For simple testing, use first texture
                mat.mainTexture = _spriteTextures[0];
            }
        }

        private Vector4 GetUVForSprite(int spriteID)
        {
            // For now, return full UV (0,0,1,1)
            // In production, this would return the UV rect for the sprite in an atlas
            return new Vector4(0, 0, 1, 1);
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