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

        [Inject] CameraService _cameraService;

        void Start()
        {
            var meshFilter = gameObject.AddComponent<MeshFilter>();
            var meshRenderer = gameObject.AddComponent<MeshRenderer>();
            meshFilter.mesh = CreateQuad();

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

            Debug.Log("[HexBiomeLayer] Biome generation delegated to HexSpawnSystem");
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
