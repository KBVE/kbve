using Unity.Entities;
using UnityEngine;

/// DOTS v2

namespace NSprites
{
    /// <summary>
    /// Authoring component for AnimationSettings.
    /// 
    /// Attach this MonoBehaviour to a prefab or GameObject to automatically
    /// bake the corresponding AnimationSettings component into an ECS entity
    /// at conversion time. This ensures that entities have precomputed
    /// animation state hashes available for systems to use.
    /// </summary>
    public class AnimationSettingsAuthoring : MonoBehaviour
    {
        /// <summary>
        /// Baker responsible for converting the authoring data into
        /// an ECS-friendly AnimationSettings component during the
        /// baking/conversion process.
        /// </summary>
        private class AnimationSettingsBaker : Baker<AnimationSettingsAuthoring>
        {
            /// <summary>
            /// Called by Unity’s baking pipeline to add ECS components
            /// at conversion time. This method creates and attaches an
            /// AnimationSettings component to the entity, pre-populated
            /// with hashed animation state names.
            /// </summary>
            /// <param name="authoring">
            /// The MonoBehaviour instance on the prefab/GameObject
            /// being converted into an ECS entity.
            /// </param>
            public override void Bake(AnimationSettingsAuthoring authoring)
            {
                AddComponent(GetEntity(TransformUsageFlags.None), new AnimationSettings
                {
                    // Hashes are precomputed using Animator.StringToHash
                    // to speed up runtime animation lookups.
                    IdleHash   = Animator.StringToHash("idle"),
                    WalkHash   = Animator.StringToHash("walk"),
                    DeathHash  = Animator.StringToHash("death"),
                    AttackHash = Animator.StringToHash("attack"),
                    HurtHash   = Animator.StringToHash("hurt")
                });
            }
        }
    }
}