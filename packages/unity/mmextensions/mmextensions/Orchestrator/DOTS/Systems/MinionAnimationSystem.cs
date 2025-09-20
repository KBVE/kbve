using Unity.Entities;
using Unity.Mathematics;
using Unity.Burst;
using Unity.Transforms;
using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Manages animation states for minions
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(MinionCombatSystem))]
    public partial class MinionAnimationSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            float deltaTime = SystemAPI.Time.DeltaTime;
            float currentTime = (float)SystemAPI.Time.ElapsedTime;

            // Update animation states based on minion state
            Entities
                .WithName("UpdateAnimationStates")
                .ForEach((Entity entity, ref AnimationState animState,
                    in MinionData minion,
                    in LocalTransform transform) =>
                {
                    // Update state timer
                    animState.StateTimer += deltaTime;

                    // Handle state transitions
                    if (animState.IsTransitioning)
                    {
                        animState.TransitionProgress += deltaTime / animState.TransitionDuration;
                        if (animState.TransitionProgress >= 1f)
                        {
                            animState.TransitionProgress = 1f;
                            animState.IsTransitioning = false;
                        }
                    }

                    // Determine animation based on minion state
                    int targetState = AnimationState.IdleHash;

                    // Death state (highest priority)
                    if ((minion.StateFlags & MinionStateFlags.Dead) != 0)
                    {
                        targetState = AnimationState.DeathHash;
                    }
                    // Stunned state
                    else if ((minion.StateFlags & MinionStateFlags.Stunned) != 0)
                    {
                        targetState = AnimationState.HitHash;
                    }
                    // Movement state
                    else if ((minion.StateFlags & MinionStateFlags.Moving) != 0)
                    {
                        targetState = AnimationState.MoveHash;
                    }
                    // Combat state
                    else if ((minion.StateFlags & MinionStateFlags.Attacking) != 0)
                    {
                        targetState = AnimationState.AttackHash;
                    }

                    // Transition to new state if different
                    if (targetState != animState.CurrentStateHash)
                    {
                        animState.TransitionTo(targetState);
                    }
                })
                .ScheduleParallel();

            // Process animation events
            Entities
                .WithName("ProcessAnimationEvents")
                .ForEach((DynamicBuffer<AnimationEventBuffer> eventBuffer,
                    ref AnimationState animState) =>
                {
                    for (int i = 0; i < eventBuffer.Length; i++)
                    {
                        var animEvent = eventBuffer[i];

                        // Check if event should trigger
                        if (animEvent.AnimationHash == animState.CurrentStateHash)
                        {
                            float normalizedTime = animState.StateTimer * animEvent.Speed;

                            if (normalizedTime >= animEvent.NormalizedTime)
                            {
                                if (!animEvent.HasTriggered || !animEvent.TriggerOnce)
                                {
                                    // Mark as triggered
                                    animEvent.HasTriggered = true;
                                    eventBuffer[i] = animEvent;

                                    // Event will be processed by other systems
                                }
                            }
                        }
                        else
                        {
                            // Reset trigger for different animation
                            if (animEvent.HasTriggered)
                            {
                                animEvent.HasTriggered = false;
                                eventBuffer[i] = animEvent;
                            }
                        }
                    }
                })
                .ScheduleParallel();

            // Handle attack animations with timing
            Entities
                .WithName("AttackAnimationTiming")
                .WithAll<DamageDealer>()
                .ForEach((ref AnimationState animState,
                    ref DamageDealer dealer,
                    in CombatTarget target) =>
                {
                    if (target.HasTarget && animState.CurrentStateHash == AnimationState.AttackHash)
                    {
                        // Sync attack timing with animation
                        float attackPoint = 0.5f; // Midpoint of animation

                        if (animState.StateTimer >= attackPoint && animState.StateTimer < attackPoint + deltaTime)
                        {
                            // This is when the actual damage should be dealt
                            // The combat system will check LastAttackTime to see if it can attack
                        }

                        // Loop attack animation if still in combat
                        float attackAnimDuration = 1f / dealer.AttackCooldown;
                        if (animState.StateTimer >= attackAnimDuration)
                        {
                            animState.StateTimer = 0f;
                        }
                    }
                })
                .ScheduleParallel();

            // Handle movement animation speed scaling
            Entities
                .WithName("MovementAnimationSpeed")
                .ForEach((ref AnimationState animState,
                    in MinionData minion) =>
                {
                    if (animState.CurrentStateHash == AnimationState.MoveHash)
                    {
                        // Scale animation speed based on movement speed
                        float speedScale = minion.Speed / 4f; // Assuming 4 is base speed
                        // This would be applied to the animator in a real implementation
                    }
                })
                .ScheduleParallel();

            // Handle death animation completion
            Entities
                .WithName("DeathAnimationCompletion")
                .ForEach((Entity entity, ref AnimationState animState,
                    in MinionData minion) =>
                {
                    if (animState.CurrentStateHash == AnimationState.DeathHash)
                    {
                        // Death animation typically lasts 2 seconds
                        if (animState.StateTimer >= 2f)
                        {
                            // Animation complete, entity can be destroyed
                            // This is handled by MinionDestructionSystem
                        }
                    }
                })
                .ScheduleParallel();
        }
    }

    /// <summary>
    /// System for procedural animations (wobble, bounce, etc.)
    /// </summary>
    [UpdateInGroup(typeof(PresentationSystemGroup))]
    public partial class ProceduralAnimationSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            float time = (float)SystemAPI.Time.ElapsedTime;
            float deltaTime = SystemAPI.Time.DeltaTime;

            // Idle animation wobble
            Entities
                .WithName("IdleWobble")
                .ForEach((ref LocalTransform transform,
                    in AnimationState animState,
                    in MinionData minion) =>
                {
                    if (animState.CurrentStateHash == AnimationState.IdleHash)
                    {
                        // Add subtle breathing/idle motion
                        float wobble = math.sin(time * 2f + transform.Position.x) * 0.05f;
                        transform.Position.y += wobble * deltaTime;
                    }
                })
                .ScheduleParallel();

            // Hit reaction animation
            Entities
                .WithName("HitReaction")
                .WithAll<DamageTaker>()
                .ForEach((ref LocalTransform transform,
                    in DamageTaker taker,
                    in AnimationState animState) =>
                {
                    if (animState.CurrentStateHash == AnimationState.HitHash)
                    {
                        // Apply hit shake
                        float shakeIntensity = (1f - animState.StateTimer) * 0.1f;
                        if (shakeIntensity > 0)
                        {
                            float shakeX = math.sin(time * 50f) * shakeIntensity;
                            float shakeZ = math.cos(time * 50f) * shakeIntensity;
                            transform.Position += new float3(shakeX, 0, shakeZ) * deltaTime;
                        }
                    }
                })
                .ScheduleParallel();

            // Movement bounce animation
            Entities
                .WithName("MovementBounce")
                .ForEach((ref LocalTransform transform,
                    ref ProceduralAnimationData procAnim,
                    in AnimationState animState,
                    in MinionData minion) =>
                {
                    if (animState.CurrentStateHash == AnimationState.MoveHash)
                    {
                        // Add bounce to movement
                        procAnim.BouncePhase += minion.Speed * deltaTime * 10f;
                        float bounce = math.abs(math.sin(procAnim.BouncePhase)) * 0.1f;

                        // Apply squash and stretch
                        float stretch = 1f + math.sin(procAnim.BouncePhase * 2f) * 0.05f;
                        transform.Scale = stretch;
                    }
                    else
                    {
                        // Reset to normal scale when not moving
                        transform.Scale = math.lerp(transform.Scale, 1f, deltaTime * 5f);
                        procAnim.BouncePhase = 0f;
                    }
                })
                .ScheduleParallel();

            // Flying minion hover animation
            Entities
                .WithName("FlyingHover")
                .ForEach((ref LocalTransform transform,
                    ref ProceduralAnimationData procAnim,
                    in MinionData minion) =>
                {
                    if (minion.Type == MinionType.Flying)
                    {
                        // Add hovering motion
                        procAnim.HoverPhase += deltaTime * 2f;
                        float hover = math.sin(procAnim.HoverPhase) * 0.2f;
                        transform.Position.y += hover * deltaTime;

                        // Add slight tilt
                        float tilt = math.sin(procAnim.HoverPhase * 0.5f) * 0.1f;
                        transform.Rotation = math.mul(transform.Rotation, quaternion.RotateZ(tilt * deltaTime));
                    }
                })
                .ScheduleParallel();
        }
    }

    /// <summary>
    /// Component for procedural animation data
    /// </summary>
    public struct ProceduralAnimationData : IComponentData
    {
        public float BouncePhase;
        public float WobblePhase;
        public float HoverPhase;
        public float SquashAmount;
        public float StretchAmount;
        public float3 ShakeOffset;
        public float ShakeIntensity;

        public static ProceduralAnimationData CreateDefault()
        {
            return new ProceduralAnimationData
            {
                BouncePhase = 0f,
                WobblePhase = 0f,
                HoverPhase = 0f,
                SquashAmount = 1f,
                StretchAmount = 1f,
                ShakeOffset = float3.zero,
                ShakeIntensity = 0f
            };
        }
    }

    /// <summary>
    /// Component for animation blend trees
    /// </summary>
    public struct AnimationBlendTree : IComponentData
    {
        public float MoveBlendX;  // -1 to 1 for left/right
        public float MoveBlendY;  // -1 to 1 for back/forward
        public float AttackBlend; // 0-1 for attack intensity
        public float IdleVariation; // Random idle animation selection
        public bool UseRootMotion;

        public static AnimationBlendTree CreateDefault()
        {
            return new AnimationBlendTree
            {
                MoveBlendX = 0f,
                MoveBlendY = 0f,
                AttackBlend = 0f,
                IdleVariation = 0f,
                UseRootMotion = false
            };
        }
    }
}