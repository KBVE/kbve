using Unity.Collections;
using UnityEngine;
using VContainer;

namespace RareIcon
{
    /// <summary>
    /// Layer 1 — static hex biome tiles. Biome data generated via Burst job,
    /// uploaded as texture, shader does hex grid + texture lookup.
    ///
    /// TODO: Replace BiomeGenerator with Rust FFI (uniti_biome_generate)
    /// TODO: Chunk streaming for infinite world
    /// TODO: Seed from server/save
    /// </summary>
    public class HexBiomeLayer : MonoBehaviour
    {
        static readonly int WorldOffsetId = Shader.PropertyToID("_WorldOffset");
        static readonly int WorldScaleId = Shader.PropertyToID("_WorldScale");
        static readonly int BiomeTexId = Shader.PropertyToID("_BiomeTex");
        static readonly int BiomeTexSizeId = Shader.PropertyToID("_BiomeTexSize");
        static readonly int BiomeWorldSizeId = Shader.PropertyToID("_BiomeWorldSize");

        Material _material;
        Texture2D _biomeTex;
        float _worldScale = 20f;
        int _texSize = 256;

        [Inject] CameraService _cameraService;

        void Start()
        {
            var meshFilter = gameObject.AddComponent<MeshFilter>();
            var meshRenderer = gameObject.AddComponent<MeshRenderer>();
            meshFilter.mesh = CreateQuad();

            // Try custom shader first, fallback to standard unlit for debug
            var shader = Shader.Find("RareIcon/HexBiome");
            if (shader == null)
            {
                Debug.LogWarning("[HexBiomeLayer] Custom shader not found, using Universal Render Pipeline/Unlit");
                shader = Shader.Find("Universal Render Pipeline/Unlit");
            }
            if (shader == null)
            {
                Debug.LogError("[HexBiomeLayer] No shader found at all");
                return;
            }

            _material = new Material(shader);
            _material.SetFloat(WorldScaleId, _worldScale);
            meshRenderer.material = _material;
            meshRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            meshRenderer.receiveShadows = false;

            GenerateBiome();
            UpdateTransform();

            var mr = GetComponent<MeshRenderer>();
            var mf = GetComponent<MeshFilter>();
            Debug.Log($"[HexBiomeLayer] Created — MeshRenderer={mr != null}, material={mr?.material?.shader?.name}, MeshFilter={mf != null}, mesh={mf?.mesh?.vertexCount}v, pos={transform.position}, scale={transform.localScale}");
        }

        void GenerateBiome()
        {
            Debug.Log("[HexBiomeLayer] Generating biome data via Burst job...");

            var generator = new BiomeGenerator(_texSize, 1337);
            var handle = generator.Schedule(out NativeArray<byte> pixels);
            handle.Complete();

            _biomeTex = new Texture2D(_texSize, _texSize, TextureFormat.RGBA32, false);
            _biomeTex.filterMode = FilterMode.Point;
            _biomeTex.wrapMode = TextureWrapMode.Clamp;
            _biomeTex.LoadRawTextureData(pixels);
            _biomeTex.Apply();

            pixels.Dispose();

            _material.SetTexture(BiomeTexId, _biomeTex);
            _material.SetFloat(BiomeTexSizeId, _texSize);
            _material.SetFloat(BiomeWorldSizeId, 25f);

            Debug.Log("[HexBiomeLayer] Biome texture uploaded");
        }

        void LateUpdate()
        {
            if (_material == null) return;
            UpdateTransform();
        }

        void UpdateTransform()
        {
            var cam = _cameraService.Camera;
            if (cam == null) return;

            var camPos = cam.transform.position;
            // Z = 1, in front of ocean (Z=10) but behind sprites (Z=0)
            transform.position = new Vector3(camPos.x, camPos.y, 1f);

            if (cam.orthographic)
            {
                float height = cam.orthographicSize * 2f * 1.5f;
                float width = height * cam.aspect;
                transform.localScale = new Vector3(width, height, 1f);
            }

            _material.SetVector(WorldOffsetId, new Vector4(camPos.x, camPos.y, 0, 0));
        }

        void OnDestroy()
        {
            if (_biomeTex != null) Destroy(_biomeTex);
        }

        static Mesh CreateQuad()
        {
            var mesh = new Mesh
            {
                vertices = new[]
                {
                    new Vector3(-0.5f, -0.5f, 0),
                    new Vector3(0.5f, -0.5f, 0),
                    new Vector3(0.5f, 0.5f, 0),
                    new Vector3(-0.5f, 0.5f, 0),
                },
                uv = new[]
                {
                    new Vector2(0, 0),
                    new Vector2(1, 0),
                    new Vector2(1, 1),
                    new Vector2(0, 1),
                },
                triangles = new[] { 0, 2, 1, 0, 3, 2 },
            };
            mesh.RecalculateNormals();
            return mesh;
        }
    }
}
