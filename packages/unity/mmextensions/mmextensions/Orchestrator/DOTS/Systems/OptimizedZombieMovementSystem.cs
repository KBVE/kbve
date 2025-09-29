using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(FlowFieldGenerationSystem))]
    [UpdateAfter(typeof(ZombieTargetingSystem))]
    [UpdateAfter(typeof(ZombieHordeFormationSystem))]
    public partial class ZombieMovementSystem : SystemBase
    {
        private EntityQuery _zombieQuery;

        protected override void OnCreate()
        {
            _zombieQuery = GetEntityQuery(
                ComponentType.ReadWrite<LocalTransform>(),
                ComponentType.ReadWrite<ZombieDestination>(),
                ComponentType.ReadWrite<ZombiePathfindingState>(),
                ComponentType.ReadOnly<ZombieSpeed>(),
                ComponentType.ReadOnly<ZombiePathfindingConfig>(),
                ComponentType.ReadOnly<ZombieTag>()
            );
        }

        protected override void OnDestroy()
        {
        }

        protected override void OnUpdate()
        {
            if (!SystemAPI.TryGetSingleton<SectorNavigationData>(out var sectorNav))
            {
                sectorNav = new SectorNavigationData
                {
                    sectorsPerAxis = 10,
                    sectorSize = 500f,
                    mapOrigin = float3.zero
                };
            }

            var moveJob = new ZombiePathfindingJob
            {
                deltaTime = SystemAPI.Time.DeltaTime,
                sectorNav = sectorNav
            };

            Dependency = moveJob.ScheduleParallel(_zombieQuery, Dependency);
        }




    }

    [BurstCompile]
    public partial struct ZombiePathfindingJob : IJobEntity
    {
        public float deltaTime;
        [ReadOnly] public SectorNavigationData sectorNav;

        public void Execute(ref LocalTransform transform,
                           ref ZombieDestination destination,
                           ref ZombiePathfindingState pathState,
                           in ZombieSpeed speed,
                           in ZombiePathfindingConfig config)
        {
            float3 currentPos = transform.Position;
            float3 targetPos = destination.targetPosition;

            int2 currentSector = sectorNav.GetSectorCoordinates(currentPos);
            int2 targetSector = sectorNav.GetSectorCoordinates(targetPos);

            if (math.all(currentSector == targetSector))
            {
                DirectMovement(ref transform, currentPos, targetPos, speed.value, deltaTime, ref pathState, config.stoppingDistance);
            }
            else
            {
                float3 sectorTarget = GetSectorGateway(currentSector, targetSector, sectorNav);
                DirectMovement(ref transform, currentPos, sectorTarget, speed.value, deltaTime, ref pathState, config.stoppingDistance);
            }
        }

        private static void DirectMovement(ref LocalTransform transform,
                                         float3 currentPos, float3 targetPos,
                                         float moveSpeed, float deltaTime,
                                         ref ZombiePathfindingState pathState,
                                         float stoppingDistance)
        {
            float3 toTarget = targetPos - currentPos;
            float distance = math.length(toTarget);
            pathState.distanceToDestination = distance;

            if (distance > stoppingDistance)
            {
                float3 direction = math.normalize(toTarget);
                float3 movement = direction * moveSpeed * deltaTime;
                transform.Position = currentPos + movement;
                transform.Position.z = 1f;
                pathState.isMoving = true;
                pathState.state = ZombiePathfindingState.PathfindingState.FollowingPath;
            }
            else
            {
                pathState.isMoving = false;
                pathState.state = ZombiePathfindingState.PathfindingState.ReachedDestination;
            }
        }

        private static float3 GetSectorGateway(int2 fromSector, int2 toSector, SectorNavigationData sectorNav)
        {
            int2 direction = math.clamp(toSector - fromSector, -1, 1);
            float3 fromCenter = sectorNav.GetSectorCenter(fromSector);

            float3 gateway = fromCenter;
            gateway.x += direction.x * sectorNav.sectorSize * 0.5f;
            gateway.y += direction.y * sectorNav.sectorSize * 0.5f;

            return gateway;
        }
    }
}