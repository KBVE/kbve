using Unity.Entities;
using UnityEngine;

namespace NSprites
{
    public class AnimationSettingsAuthoring : MonoBehaviour
    {
        private class AnimationSettingsBaker : Baker<AnimationSettingsAuthoring>
        {
            public override void Bake(AnimationSettingsAuthoring authoring)
            {
                AddComponent(GetEntity(TransformUsageFlags.None), new AnimationSettings
                {
                    IdleHash = Animator.StringToHash("idle"),
                    Idle2Hash = Animator.StringToHash("idle2"),
                    WalkHash = Animator.StringToHash("walk"),
                    AttackHash = Animator.StringToHash("attack"),
                    DeathHash = Animator.StringToHash("death"),
                    HurtHash = Animator.StringToHash("hurt"),
                    JumpHash = Animator.StringToHash("jump")
                });
            }
        }
    }
}