using UnityEngine;
using VContainer;

namespace RareIcon
{
    /// <summary>
    /// Created by RootLifetimeScope. Procedural ocean shader — no textures needed.
    /// Tracks camera via CameraService for infinite scrolling.
    /// </summary>
    public class OceanBackground : MonoBehaviour
    {
        static readonly int WorldOffsetId = Shader.PropertyToID("_WorldOffset");
        static readonly int WorldScaleId = Shader.PropertyToID("_WorldScale");

        Material _material;
        float _worldScale = 20f;

        [Inject] CameraService _cameraService;

        void Start()
        {
            var meshFilter = gameObject.AddComponent<MeshFilter>();
            var meshRenderer = gameObject.AddComponent<MeshRenderer>();
            meshFilter.mesh = CreateQuad();

            var shader = Shader.Find("RareIcon/OceanBackground");
            if (shader == null)
            {
                Debug.LogError("[OceanBackground] Shader 'RareIcon/OceanBackground' not found");
                return;
            }

            _material = new Material(shader);
            _material.SetFloat(WorldScaleId, _worldScale);
            meshRenderer.material = _material;
            meshRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            meshRenderer.receiveShadows = false;

            UpdateTransform();
            Debug.Log("[OceanBackground] Created");
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
            transform.position = new Vector3(camPos.x, camPos.y, 10f);

            if (cam.orthographic)
            {
                float height = cam.orthographicSize * 2f * 1.5f;
                float width = height * cam.aspect;
                transform.localScale = new Vector3(width, height, 1f);
            }

            _material.SetVector(WorldOffsetId, new Vector4(camPos.x, camPos.y, 0, 0));
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
