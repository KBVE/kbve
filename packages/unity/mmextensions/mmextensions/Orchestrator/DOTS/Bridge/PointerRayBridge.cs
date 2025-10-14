using UnityEngine;
using Unity.Entities;
using Unity.Mathematics;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Bridge
{
    public sealed class PointerRayBridge : MonoBehaviour
    {
        [SerializeField] private Camera cam;
        [SerializeField] private float maxDistance = 100f;
        [SerializeField] private float updateThreshold = 0.5f;

        EntityManager _em;
        Entity _singleton;
        
        private Vector3 _lastMousePos;
        private bool _isDirty;
        
        void Awake()
        {
            if (cam == null) cam = Camera.main;
            _em = World.DefaultGameObjectInjectionWorld.EntityManager;

            var q = _em.CreateEntityQuery(ComponentType.ReadOnly<PlayerPointerRay>());
            
            if (!q.TryGetSingletonEntity<PlayerPointerRay>(out _singleton))
            {
                _singleton = _em.CreateEntity(typeof(PlayerPointerRay));
                _em.SetName(_singleton, "PlayerPointerRaySingleton");
            }
            
            q.Dispose();
            
            // Initialize once
            UpdateRay(Input.mousePosition);
        }

        void Update()
        {
            if (cam == null) return;

            var mousePos = Input.mousePosition;
            
            // Only update if mouse moved beyond threshold
            if (Vector3.Distance(mousePos, _lastMousePos) < updateThreshold)
                return;

            UpdateRay(mousePos);
        }

        private void UpdateRay(Vector3 mousePos)
        {
            _lastMousePos = mousePos;
            var ray = cam.ScreenPointToRay(mousePos);
            
            _em.SetComponentData(_singleton, new PlayerPointerRay
            {
                Origin = ray.origin,
                Direction = ray.direction,
                MaxDistance = maxDistance
            });
        }
    }
}