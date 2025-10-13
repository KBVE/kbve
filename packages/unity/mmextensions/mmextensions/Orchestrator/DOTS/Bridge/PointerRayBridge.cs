using UnityEngine;
using Unity.Entities;
using Unity.Mathematics;
using KBVE.MMExtensions.Orchestrator.DOTS;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Bridge
{
    public sealed class PointerRayBridge : MonoBehaviour
    {
        [SerializeField] private Camera cam;
        [SerializeField] private float maxDistance = 100f;

        EntityManager _em;
        Entity _singleton;

        void Awake()
        {
            if (cam == null) cam = Camera.main; // only once in Mono
            _em = World.DefaultGameObjectInjectionWorld.EntityManager;

            // Create a typed query and explicitly specify T in TryGetSingletonEntity<T>
            var q = _em.CreateEntityQuery(ComponentType.ReadOnly<PlayerPointerRay>());

            var exists = q.TryGetSingletonEntity<PlayerPointerRay>(out _singleton);
            q.Dispose(); // good hygiene

            if (!exists)
            {
                _singleton = _em.CreateEntity(typeof(PlayerPointerRay));
                _em.SetName(_singleton, "PlayerPointerRaySingleton");
                _em.SetComponentData(_singleton, new PlayerPointerRay { MaxDistance = maxDistance });
            }
        }

        void Update()
        {
            if (!cam) return;

            var ray = cam.ScreenPointToRay(Input.mousePosition);
            _em.SetComponentData(_singleton, new PlayerPointerRay
            {
                Origin = ray.origin,
                Direction = ray.direction,
                MaxDistance = maxDistance
            });
        }
    }
}