using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;

/// TODO: Fix the Minion Authoring for DOTSv2
/// 
namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Simple zombie authoring component that is designed to create the base zombie entitiy that then follows the base AoS struct.
    /// </summary>
    [DisallowMultipleComponent]
    [RequireComponent(typeof(Transform), typeof(NSprites.SpriteAnimatedRendererAuthoring))]
    [HelpURL("https://kbve.com/application/unity/#minionauthoring")]
    public class MinionAuthoring : MonoBehaviour
    {
        private class MinionBaker : Baker<MinionAuthoring>
        {
            public override void Bake(MinionAuthoring authoring)
            {
                var entity = GetEntity(TransformUsageFlags.None);
                AddComponent<ZombieTag>(entity);
                AddComponent<MovingTag>(entity);
                SetComponentEnabled<MovingTag>(entity, false);
                AddComponent<Destination>(entity);
                AddComponent<MoveTimer>(entity);
                AddComponent(entity, new MoveSpeed { value = authoring.MoveSpeed });
            }
        }

        public float MoveSpeed;
    }
}