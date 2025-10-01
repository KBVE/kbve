using NSprites;
using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;
using UnityEngine.Serialization;

/// DOTS v2

namespace KBVE.MMExtensions.Orchestrator.DOTS
{

    /// <summary>
    /// Horde Mode Authoring component, replacing the FactoryAuthoring.
    /// </summary>
    [DisallowMultipleComponent]
    [RequireComponent(typeof(Transform))]
    [HelpURL("https://kbve.com/application/unity/#hordeauthoring")]
    public class HordeAuthoring : MonoBehaviour {
        private class HordeBaker : Baker<HordeAuthoring>
        {
            public override void Bake(HordeAuthoring authoring)
            {
                // Safety check: prevent baking a factory with no prefab assigned.
                // Without this, we'd create an invalid entity that can't spawn anything.
                // if (authoring.Prefab == null)
                // {
                //     UnityEngine.Debug.LogError($"[FactoryBaker] {authoring.name} has no prefab assigned!");
                //     return;
                // }

                // Setup Entity
                var entity = GetEntity(TransformUsageFlags.None);
                var pos = new float3(authoring.transform.position).xy;

                // <C>
                AddComponent(entity, new WorldPosition2D { Value = pos});
                AddComponent(entity, new PrevWorldPosition2D { value = pos});
                AddComponent(entity, new HordeSettings { hordeResolution = authoring.Resolution, minionMargin = authoring.MinionMargin });
                AddComponent(entity, new RequireMinion { count = authoring.Resolution.x * authoring.Resolution.y});
                // AddComponent(entity, new PhysicsMinion {}
                _ = AddBuffer<MinionLink>(entity);
            }
        }


        [FormerlySerializedAs("_resolution")] public int2 Resolution;
        [FormerlySerializedAs("_minionMargin")] public float2 MinionMargin;


    }
}