using Unity.Burst;
using Unity.Entities;
using Unity.Transforms;
using Unity.Mathematics;
using Unity.Collections;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{
    /// <summary>
    /// System that gently biases zombie movement toward letter shapes (K, B, V, E)
    /// Applies very light influence to wandering behavior to create loose formations
    /// Zombies maintain natural distribution while subtly trending toward letters
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(ZombieTargetingSystem))]
    public partial class ZombieFormationSystem : SystemBase
    {
        private EntityQuery _zombieQuery;
        private EntityQuery _controllerQuery;
        private Entity _controllerEntity;
        private Unity.Mathematics.Random _random;

        protected override void OnCreate()
        {
            _zombieQuery = GetEntityQuery(
                ComponentType.ReadWrite<ZombieNavigation>(),
                ComponentType.ReadWrite<ZombieDestination>(),
                ComponentType.ReadWrite<ZombieFormationMember>(),
                ComponentType.ReadOnly<LocalTransform>(),
                ComponentType.ReadOnly<ZombieTag>()
            );

            _controllerQuery = GetEntityQuery(ComponentType.ReadWrite<ZombieFormationController>());
            _random = new Unity.Mathematics.Random(1337);

            RequireForUpdate(_zombieQuery);
        }

        protected override void OnUpdate()
        {
            // Create formation controller if it doesn't exist
            if (_controllerQuery.IsEmpty)
            {
                _controllerEntity = EntityManager.CreateEntity();
                EntityManager.AddComponentData(_controllerEntity, ZombieFormationController.CreateDefault());
                EntityManager.AddComponentData(_controllerEntity, new ZombieFormationStats());
            }
            else
            {
                _controllerEntity = _controllerQuery.GetSingletonEntity();
            }

            var controller = EntityManager.GetComponentData<ZombieFormationController>(_controllerEntity);

            // Update formation controller timing - longer durations for gradual formation
            controller.letterTimer += SystemAPI.Time.DeltaTime;
            if (controller.letterTimer >= controller.letterDuration)
            {
                controller.letterTimer = 0f;
                controller.currentLetter = (controller.currentLetter + 1) % 4; // Cycle through K, B, V, E
            }

            // Get zombie count for calculations
            int zombieCount = _zombieQuery.CalculateEntityCount();

            if (zombieCount > 0)
            {
                // Apply gentle formation bias - don't force tight formations
                var driftJob = new ZombieDriftJob
                {
                    currentLetter = controller.currentLetter,
                    formationCenter = controller.formationCenter,
                    formationScale = controller.formationScale * 2f, // Much larger scale to spread zombies out
                    totalZombies = zombieCount,
                    currentTime = (float)SystemAPI.Time.ElapsedTime,
                    driftStrength = 0.1f, // Very light influence - just a gentle bias
                    random = _random
                };

                Dependency = driftJob.ScheduleParallel(_zombieQuery, Dependency);
                _random = driftJob.random;
            }

            // Update controller
            EntityManager.SetComponentData(_controllerEntity, controller);
        }
    }

    [BurstCompile]
    partial struct ZombieDriftJob : IJobEntity
    {
        public int currentLetter;
        public float3 formationCenter;
        public float formationScale;
        public int totalZombies;
        public float currentTime;
        public float driftStrength;
        public Unity.Mathematics.Random random;

        public void Execute(
            ref ZombieNavigation navigation,
            ref ZombieDestination destination,
            ref ZombieFormationMember formation,
            in LocalTransform transform)
        {
            // Only apply formation if zombie doesn't have a target and formation is active
            if (navigation.hasTarget || navigation.isActivelySearching || !formation.isActive)
                return;

            // Get the ideal position for this zombie's formation index
            GetLetterPosition(currentLetter, formation.formationIndex, totalZombies, out float2 idealPos);
            float3 idealWorldPos = formationCenter + new float3(
                idealPos.x * formationScale,
                idealPos.y * formationScale,
                0
            );

            float3 currentPos = transform.Position;
            float3 toIdeal = idealWorldPos - currentPos;
            float distanceToIdeal = math.length(toIdeal);

            // Apply gentle bias toward formation - don't override wandering completely
            if (distanceToIdeal < formationScale * 1.5f && distanceToIdeal > 5f) // Only influence if reasonably close
            {
                // Get current destination from wandering
                float3 currentDestination = destination.targetPosition;

                // Create a biased destination that's partly toward ideal position
                float3 toDestination = currentDestination - currentPos;
                float3 biasedDirection = math.normalize(math.lerp(toDestination, toIdeal, driftStrength));

                // Only update destination with gentle bias, don't force exact positioning
                float3 biasedDestination = currentPos + biasedDirection * math.length(toDestination);

                // Only update if the change is meaningful but not too drastic
                if (math.distance(biasedDestination, currentDestination) > 2f &&
                    math.distance(biasedDestination, currentDestination) < 15f)
                {
                    destination.targetPosition = biasedDestination;
                    destination.facingDirection = biasedDirection;
                }
            }
        }

        [BurstCompile]
        private static void GetLetterPosition(int letter, int zombieIndex, int totalZombies, out float2 position)
        {
            // Distribute zombies across the letter pattern
            float t = (float)zombieIndex / totalZombies;

            switch (letter)
            {
                case 0:
                    GetLetterK(t, out position);
                    break;
                case 1:
                    GetLetterB(t, out position);
                    break;
                case 2:
                    GetLetterV(t, out position);
                    break;
                case 3:
                    GetLetterE(t, out position);
                    break;
                default:
                    position = float2.zero;
                    break;
            }
        }

        [BurstCompile]
        private static void GetLetterK(float t, out float2 position)
        {
            // Letter K: vertical line + two diagonal lines
            if (t < 0.4f) // Vertical line
            {
                float y = math.lerp(-1f, 1f, t / 0.4f);
                position = new float2(-0.5f, y);
            }
            else if (t < 0.7f) // Upper diagonal
            {
                float progress = (t - 0.4f) / 0.3f;
                float x = math.lerp(-0.5f, 0.5f, progress);
                float y = math.lerp(0f, 1f, progress);
                position = new float2(x, y);
            }
            else // Lower diagonal
            {
                float progress = (t - 0.7f) / 0.3f;
                float x = math.lerp(-0.5f, 0.5f, progress);
                float y = math.lerp(0f, -1f, progress);
                position = new float2(x, y);
            }
        }

        [BurstCompile]
        private static void GetLetterB(float t, out float2 position)
        {
            // Letter B: vertical line + two bumps
            if (t < 0.3f) // Vertical line
            {
                float y = math.lerp(-1f, 1f, t / 0.3f);
                position = new float2(-0.5f, y);
            }
            else if (t < 0.65f) // Upper bump
            {
                float progress = (t - 0.3f) / 0.35f;
                float angle = progress * math.PI;
                float x = -0.5f + 0.4f * (1f - math.cos(angle));
                float y = 0.5f + 0.5f * math.sin(angle);
                position = new float2(x, y);
            }
            else // Lower bump
            {
                float progress = (t - 0.65f) / 0.35f;
                float angle = progress * math.PI;
                float x = -0.5f + 0.4f * (1f - math.cos(angle));
                float y = -0.5f - 0.5f * math.sin(angle);
                position = new float2(x, y);
            }
        }

        [BurstCompile]
        private static void GetLetterV(float t, out float2 position)
        {
            // Letter V: two diagonal lines meeting at bottom
            if (t < 0.5f) // Left diagonal
            {
                float progress = t / 0.5f;
                float x = math.lerp(-0.5f, 0f, progress);
                float y = math.lerp(1f, -1f, progress);
                position = new float2(x, y);
            }
            else // Right diagonal
            {
                float progress = (t - 0.5f) / 0.5f;
                float x = math.lerp(0f, 0.5f, progress);
                float y = math.lerp(-1f, 1f, progress);
                position = new float2(x, y);
            }
        }

        [BurstCompile]
        private static void GetLetterE(float t, out float2 position)
        {
            // Letter E: vertical line + three horizontal lines
            if (t < 0.4f) // Vertical line
            {
                float y = math.lerp(-1f, 1f, t / 0.4f);
                position = new float2(-0.5f, y);
            }
            else if (t < 0.6f) // Top horizontal
            {
                float progress = (t - 0.4f) / 0.2f;
                float x = math.lerp(-0.5f, 0.3f, progress);
                position = new float2(x, 1f);
            }
            else if (t < 0.8f) // Middle horizontal
            {
                float progress = (t - 0.6f) / 0.2f;
                float x = math.lerp(-0.5f, 0.2f, progress);
                position = new float2(x, 0f);
            }
            else // Bottom horizontal
            {
                float progress = (t - 0.8f) / 0.2f;
                float x = math.lerp(-0.5f, 0.3f, progress);
                position = new float2(x, -1f);
            }
        }
    }
}