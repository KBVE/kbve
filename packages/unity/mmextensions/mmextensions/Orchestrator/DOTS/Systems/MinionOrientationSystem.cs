using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using Unity.Burst;
using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Handles minion orientation and facing direction
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(MinionMovementSystem))]
    public partial class MinionOrientationSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            float deltaTime = SystemAPI.Time.DeltaTime;

            // Update orientation based on movement
            Entities
                .WithName("OrientationFromMovement")
                .ForEach((Entity entity, ref OrientationData orientation,
                    ref LocalTransform transform,
                    in MinionData minion) =>
                {
                    if (orientation.Mode == OrientationMode.None) return;

                    // Calculate facing based on mode
                    float3 targetDirection = orientation.FacingDirection;

                    if (orientation.Mode == OrientationMode.Movement)
                    {
                        // Movement direction will be handled by MinionMovementSystem
                        // For now, keep current facing direction
                    }
                    else if (orientation.Mode == OrientationMode.Target)
                    {
                        // Face combat target would be handled here
                        // Requires entity parameter to access SystemAPI
                    }

                    // Update facing direction
                    if (math.lengthsq(targetDirection) > 0.01f)
                    {
                        orientation.FacingDirection = targetDirection;

                        // Calculate target rotation
                        float targetAngle = math.atan2(targetDirection.x, targetDirection.z);
                        orientation.TargetRotation = targetAngle;

                        // Smooth rotation
                        float rotationDiff = targetAngle - orientation.CurrentRotation;

                        // Wrap rotation difference to [-PI, PI]
                        while (rotationDiff > math.PI) rotationDiff -= 2f * math.PI;
                        while (rotationDiff < -math.PI) rotationDiff += 2f * math.PI;

                        orientation.CurrentRotation += rotationDiff * math.min(1f, orientation.RotationSpeed * deltaTime);

                        // Apply rotation to transform
                        transform.Rotation = quaternion.RotateY(orientation.CurrentRotation);

                        // Handle 2D sprite flipping
                        if (orientation.FlipSprite)
                        {
                            // Determine if facing left or right
                            bool facingLeft = targetDirection.x < 0;

                            // Apply scale flip if needed
                            float scaleX = facingLeft ? -1f : 1f;
                            transform.Scale = math.abs(transform.Scale) * scaleX;
                        }
                    }
                })
                .ScheduleParallel();

            // Special orientation for projectiles
            Entities
                .WithName("ProjectileOrientation")
                .WithAll<ProjectileTag>()
                .ForEach((Entity entity, ref LocalTransform transform,
                    ref OrientationData orientation) =>
                {
                    // Always face movement direction
                    if (SystemAPI.HasComponent<ProjectileMovement>(entity))
                    {
                        var projectile = SystemAPI.GetComponent<ProjectileMovement>(entity);
                        if (math.lengthsq(projectile.Velocity) > 0.01f)
                        {
                            float3 direction = math.normalize(projectile.Velocity);
                            transform.Rotation = quaternion.LookRotationSafe(direction, math.up());
                        }
                    }
                })
                .ScheduleParallel();

            // Handle strafing behavior (move in one direction while facing another)
            Entities
                .WithName("StrafingOrientation")
                .WithAll<StrafingBehavior>()
                .ForEach((ref OrientationData orientation,
                    ref LocalTransform transform,
                    in StrafingBehavior strafing,
                    in CombatTarget target) =>
                {
                    if (!target.HasTarget) return;

                    // Always face the target while moving
                    float3 toTarget = math.normalize(target.TargetLastKnownPosition - transform.Position);

                    float targetAngle = math.atan2(toTarget.x, toTarget.z);
                    float angleDiff = targetAngle - orientation.CurrentRotation;

                    // Smooth rotation towards target
                    while (angleDiff > math.PI) angleDiff -= 2f * math.PI;
                    while (angleDiff < -math.PI) angleDiff += 2f * math.PI;

                    orientation.CurrentRotation += angleDiff * math.min(1f, orientation.RotationSpeed * 2f * deltaTime);
                    transform.Rotation = quaternion.RotateY(orientation.CurrentRotation);

                    orientation.FacingDirection = toTarget;
                })
                .ScheduleParallel();
        }
    }

    /// <summary>
    /// Component for strafing behavior
    /// </summary>
    public struct StrafingBehavior : IComponentData
    {
        public float StrafeSpeed;
        public float StrafeRadius;
        public float StrafeDirection; // 1 for clockwise, -1 for counter-clockwise
        public float TimeToSwitch;
        public float SwitchTimer;

        public static StrafingBehavior Create()
        {
            return new StrafingBehavior
            {
                StrafeSpeed = 3f,
                StrafeRadius = 5f,
                StrafeDirection = 1f,
                TimeToSwitch = 2f,
                SwitchTimer = 0f
            };
        }
    }

    /// <summary>
    /// Tag for projectile entities
    /// </summary>
    public struct ProjectileTag : IComponentData { }

    /// <summary>
    /// Component for projectile movement
    /// </summary>
    public struct ProjectileMovement : IComponentData
    {
        public float3 Velocity;
        public float Speed;
        public float Lifetime;
        public float SpawnTime;
        public bool UseGravity;
        public float GravityScale;

        public static ProjectileMovement CreateStraight(float3 direction, float speed)
        {
            return new ProjectileMovement
            {
                Velocity = direction * speed,
                Speed = speed,
                Lifetime = 5f,
                SpawnTime = 0f,
                UseGravity = false,
                GravityScale = 0f
            };
        }

        public static ProjectileMovement CreateArcing(float3 direction, float speed)
        {
            return new ProjectileMovement
            {
                Velocity = direction * speed,
                Speed = speed,
                Lifetime = 10f,
                SpawnTime = 0f,
                UseGravity = true,
                GravityScale = 9.8f
            };
        }
    }

    /// <summary>
    /// Component for movement target (used by orientation system)
    /// </summary>
    public struct MinionMovementTarget : IComponentData
    {
        public float3 TargetPosition;
        public bool HasTarget;
        public float StoppingDistance;
        public bool ReachedTarget;

        public void SetTarget(float3 position, float stoppingDistance = 0.5f)
        {
            TargetPosition = position;
            HasTarget = true;
            StoppingDistance = stoppingDistance;
            ReachedTarget = false;
        }

        public void ClearTarget()
        {
            HasTarget = false;
            ReachedTarget = true;
        }
    }

    /// <summary>
    /// System for advanced orientation behaviors
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(MinionOrientationSystem))]
    public partial class AdvancedOrientationSystem : SystemBase
    {
        private Unity.Mathematics.Random _random;

        protected override void OnCreate()
        {
            _random = new Unity.Mathematics.Random((uint)System.DateTime.Now.Ticks);
        }

        protected override void OnUpdate()
        {
            float deltaTime = SystemAPI.Time.DeltaTime;
            var randomLocal = _random;

            // Update strafing behavior
            Entities
                .WithName("UpdateStrafing")
                .ForEach((ref StrafingBehavior strafing,
                    ref MinionMovementTarget movementTarget,
                    in LocalTransform transform,
                    in CombatTarget target) =>
                {
                    if (!target.HasTarget) return;

                    strafing.SwitchTimer += deltaTime;

                    // Switch strafe direction periodically
                    if (strafing.SwitchTimer >= strafing.TimeToSwitch)
                    {
                        strafing.StrafeDirection *= -1f;
                        strafing.SwitchTimer = 0f;
                        strafing.TimeToSwitch = randomLocal.NextFloat(1.5f, 3f);
                    }

                    // Calculate strafe movement
                    float3 toTarget = target.TargetLastKnownPosition - transform.Position;
                    float3 strafeDir = math.normalize(math.cross(math.up(), toTarget));
                    strafeDir *= strafing.StrafeDirection;

                    // Maintain distance while strafing
                    float currentDistance = math.length(toTarget);
                    float3 movePosition = transform.Position;

                    if (currentDistance < strafing.StrafeRadius * 0.8f)
                    {
                        // Too close, move away
                        movePosition -= math.normalize(toTarget) * strafing.StrafeSpeed * deltaTime;
                    }
                    else if (currentDistance > strafing.StrafeRadius * 1.2f)
                    {
                        // Too far, move closer
                        movePosition += math.normalize(toTarget) * strafing.StrafeSpeed * deltaTime;
                    }

                    // Apply strafe movement
                    movePosition += strafeDir * strafing.StrafeSpeed * deltaTime;
                    movementTarget.SetTarget(movePosition, 0.1f);
                })
                .ScheduleParallel();

            // Update projectile physics
            Entities
                .WithName("UpdateProjectiles")
                .WithAll<ProjectileTag>()
                .ForEach((ref LocalTransform transform,
                    ref ProjectileMovement projectile) =>
                {
                    // Apply gravity if enabled
                    if (projectile.UseGravity)
                    {
                        projectile.Velocity.y -= projectile.GravityScale * deltaTime;
                    }

                    // Move projectile
                    transform.Position += projectile.Velocity * deltaTime;

                    // Update lifetime
                    projectile.SpawnTime += deltaTime;
                })
                .ScheduleParallel();

            _random = randomLocal;
        }
    }
}