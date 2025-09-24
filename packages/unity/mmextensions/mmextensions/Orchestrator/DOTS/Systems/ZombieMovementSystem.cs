using Unity.Burst;
using Unity.Entities;
using Unity.Transforms;
using Unity.Mathematics;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{

    /// <summary>
    /// Clean Unity DOTS zombie movement system using direct transform movement
    /// Handles both wandering behavior and formation movement
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(ZombieTargetingSystem))]
    [UpdateAfter(typeof(ZombieHordeFormationSystem))]
    public partial class ZombieMovementSystem : SystemBase
    {
        private Unity.Mathematics.Random _random;

        protected override void OnCreate()
        {
            _random = new Unity.Mathematics.Random(1234);
        }

        protected override void OnUpdate()
        {
            float deltaTime = SystemAPI.Time.DeltaTime;
            float currentTime = (float)SystemAPI.Time.ElapsedTime;
            var random = _random;

            // Direct movement for all zombies using Unity DOTS
            Entities
                .WithAll<ZombieTag>()
                .ForEach((ref LocalTransform transform,
                         ref ZombieNavigation navigation,
                         ref ZombieDestination destination,
                         ref ZombiePathfindingState pathState,
                         in ZombieSpeed speed,
                         in ZombiePathfindingConfig config) =>
                {
                    float3 currentPos = transform.Position;
                    float3 targetPos = destination.targetPosition;

                    // Calculate distance to destination
                    float3 toDestination = targetPos - currentPos;
                    float distance = math.length(toDestination);
                    pathState.distanceToDestination = distance;

                    // Generate wandering behavior if no specific destination or very close
                    if (distance < 0.1f || (!navigation.hasTarget && !navigation.isActivelySearching))
                    {
                        if (currentTime - pathState.lastDestinationUpdate > random.NextFloat(3f, 6f))
                        {
                            pathState.lastDestinationUpdate = currentTime;

                            float wanderRadius = 8f;
                            float angle = random.NextFloat() * 2f * math.PI;
                            float wanderDistance = random.NextFloat(3f, wanderRadius);

                            float3 wanderOffset = new float3(
                                math.cos(angle) * wanderDistance,
                                math.sin(angle) * wanderDistance,
                                0
                            );

                            destination.targetPosition = currentPos + wanderOffset;
                            destination.targetPosition.z = 1f;
                            pathState.isMoving = true;
                        }
                    }

                    // Direct movement toward destination
                    if (distance > config.stoppingDistance)
                    {
                        float3 direction = math.normalize(toDestination);
                        float moveSpeed = speed.value;

                        // Apply movement
                        float3 movement = direction * moveSpeed * deltaTime;
                        transform.Position = currentPos + movement;
                        transform.Position.z = 1f; // Keep at sprite layer

                        // Update facing direction
                        destination.facingDirection = direction;
                        pathState.isMoving = true;
                        pathState.state = ZombiePathfindingState.PathfindingState.FollowingPath;
                    }
                    else
                    {
                        pathState.isMoving = false;
                        pathState.state = ZombiePathfindingState.PathfindingState.ReachedDestination;
                    }
                }).Schedule();

            _random = random;
        }
    }
}