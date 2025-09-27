using Unity.Burst;
using Unity.Entities;
using Unity.Transforms;
using Unity.Mathematics;
using Unity.Collections;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{
    /// <summary>
    /// System that organizes zombies into horde formations like squads in Age of Sprites
    /// Automatically groups zombies and arranges them in practical formation patterns
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(ZombieTargetingSystem))]
    [BurstCompile]
    public partial class ZombieHordeFormationSystem : SystemBase
    {
        private EntityQuery _zombieQuery;
        private EntityQuery _hordeQuery;

        protected override void OnCreate()
        {
            _zombieQuery = GetEntityQuery(
                ComponentType.ReadWrite<ZombieDestination>(),
                ComponentType.ReadWrite<ZombieHordeMember>(),
                ComponentType.ReadOnly<LocalTransform>(),
                ComponentType.ReadOnly<ZombieTag>()
            );

            _hordeQuery = GetEntityQuery(
                ComponentType.ReadWrite<ZombieHordeCenter>(),
                ComponentType.ReadOnly<ZombieHordeSettings>()
            );

            RequireForUpdate(_zombieQuery);
        }

        protected override void OnUpdate()
        {
            // Auto-create horde groups if needed
            CreateHordeGroupsIfNeeded();

            // Update zombie positions within their hordes
            UpdateHordeFormations();
        }

        private void CreateHordeGroupsIfNeeded()
        {
            // Count zombies without hordes
            var zombiesWithoutHorde = 0;
            foreach (var (hordeMember, entity) in SystemAPI.Query<RefRW<ZombieHordeMember>>().WithEntityAccess())
            {
                if (hordeMember.ValueRO.hordeEntity == Entity.Null)
                {
                    zombiesWithoutHorde++;
                }
            }

            // Create new horde groups for unassigned zombies (100 zombies per horde)
            const int zombiesPerHorde = 100;
            int hordesToCreate = zombiesWithoutHorde / zombiesPerHorde;

            for (int i = 0; i < hordesToCreate; i++)
            {
                // Create horde entity
                var hordeEntity = EntityManager.CreateEntity();
                EntityManager.AddComponentData(hordeEntity, ZombieHordeSettings.CreateDefault(HordeFormationType.Grid));
                EntityManager.AddComponentData(hordeEntity, ZombieHordeCenter.CreateDefault(new float3(0, 0, 1)));

                // Assign zombies to this horde
                int assignedCount = 0;
                foreach (var (hordeMember, entity) in SystemAPI.Query<RefRW<ZombieHordeMember>>().WithEntityAccess())
                {
                    if (hordeMember.ValueRO.hordeEntity == Entity.Null && assignedCount < zombiesPerHorde)
                    {
                        hordeMember.ValueRW.hordeEntity = hordeEntity;
                        hordeMember.ValueRW.hordeIndex = assignedCount;
                        assignedCount++;
                    }
                }
            }
        }

        private void UpdateHordeFormations()
        {
            float deltaTime = SystemAPI.Time.DeltaTime;
            float currentTime = (float)SystemAPI.Time.ElapsedTime;

            // Update horde patrol movement in parallel using Burst
            var patrolJob = new HordePatrolJob
            {
                deltaTime = deltaTime,
                currentTime = currentTime
            };
            Dependency = patrolJob.ScheduleParallel(Dependency);

            // Update all zombies to maintain formation with their hordes
            var formationJob = new HordeFormationJob
            {
                hordeEntityLookup = SystemAPI.GetComponentLookup<ZombieHordeCenter>(true),
                hordeSettingsLookup = SystemAPI.GetComponentLookup<ZombieHordeSettings>(true)
            };
            Dependency = formationJob.ScheduleParallel(_zombieQuery, Dependency);
        }
    }

    [BurstCompile]
    partial struct HordePatrolJob : IJobEntity
    {
        public float deltaTime;
        public float currentTime;

        public void Execute(Entity entity, ref ZombieHordeCenter hordeCenter)
        {
            // Use entity index for unique patrol pattern
            int hordeId = entity.Index;
            float patrolRadius = 100f;  // Compact patrol area - 100 unit radius
            float patrolFreq = 0.03f + (hordeId % 10) * 0.01f;  // Varied patrol speeds

            // Calculate circular patrol position
            float angle = currentTime * patrolFreq + (hordeId * 1.3f);
            float3 patrolTarget = hordeCenter.spawnPosition + new float3(
                math.cos(angle) * patrolRadius,
                math.sin(angle) * patrolRadius,
                0
            );

            // Update target and move towards it
            hordeCenter.targetPosition = patrolTarget;

            float3 toTarget = patrolTarget - hordeCenter.position;
            float distanceToTarget = math.length(toTarget);

            if (distanceToTarget > 3f)
            {
                float3 moveDirection = math.normalize(toTarget);
                hordeCenter.position += moveDirection * hordeCenter.moveSpeed * deltaTime;
            }
        }
    }

    [BurstCompile]
    partial struct HordeFormationJob : IJobEntity
    {
        [ReadOnly] public ComponentLookup<ZombieHordeCenter> hordeEntityLookup;
        [ReadOnly] public ComponentLookup<ZombieHordeSettings> hordeSettingsLookup;

        public void Execute(
            ref ZombieDestination destination,
            in ZombieHordeMember hordeMember,
            in LocalTransform transform)
        {
            // Skip inactive or unassigned zombies
            if (!hordeMember.isActive || hordeMember.hordeEntity == Entity.Null)
                return;

            // Get horde data from lookup
            if (!hordeEntityLookup.TryGetComponent(hordeMember.hordeEntity, out var hordeCenter))
                return;
            if (!hordeSettingsLookup.TryGetComponent(hordeMember.hordeEntity, out var hordeSettings))
                return;

            // Calculate formation position based on horde index and formation type
            float3 formationPosition;
            GetFormationPosition(hordeMember.hordeIndex, in hordeSettings, in hordeCenter.position, out formationPosition);

            // Set destination to maintain formation position
            destination.targetPosition = formationPosition;
            destination.facingDirection = math.normalize(formationPosition - transform.Position);
        }

        [BurstCompile]
        private static void GetFormationPosition(int index, in ZombieHordeSettings settings, in float3 center, out float3 position)
        {
            switch (settings.formationType)
            {
                case HordeFormationType.Grid:
                    GetGridPosition(index, in settings, in center, out position);
                    break;
                case HordeFormationType.Line:
                    GetLinePosition(index, in settings, in center, out position);
                    break;
                case HordeFormationType.Wedge:
                    GetWedgePosition(index, in settings, in center, out position);
                    break;
                case HordeFormationType.Circle:
                    GetCirclePosition(index, in settings, in center, out position);
                    break;
                case HordeFormationType.Column:
                    GetColumnPosition(index, in settings, in center, out position);
                    break;
                default:
                    GetBlobPosition(index, in settings, in center, out position);
                    break;
            }
        }

        [BurstCompile]
        private static void GetGridPosition(int index, in ZombieHordeSettings settings, in float3 center, out float3 position)
        {
            int row = index / settings.formationSize.x;
            int col = index % settings.formationSize.x;

            float3 offset = new float3(
                (col - settings.formationSize.x * 0.5f) * settings.zombieSpacing.x,
                (row - settings.formationSize.y * 0.5f) * settings.zombieSpacing.y,
                0
            );

            position = center + offset;
        }

        [BurstCompile]
        private static void GetLinePosition(int index, in ZombieHordeSettings settings, in float3 center, out float3 position)
        {
            float3 offset = new float3((index - 50) * settings.zombieSpacing.x, 0, 0);
            position = center + offset;
        }

        [BurstCompile]
        private static void GetWedgePosition(int index, in ZombieHordeSettings settings, in float3 center, out float3 position)
        {
            int row = (int)math.sqrt(index);
            int posInRow = index - row * row;

            float3 offset = new float3(
                (posInRow - row * 0.5f) * settings.zombieSpacing.x,
                -row * settings.zombieSpacing.y,
                0
            );

            position = center + offset;
        }

        [BurstCompile]
        private static void GetCirclePosition(int index, in ZombieHordeSettings settings, in float3 center, out float3 position)
        {
            float angle = (index / 100f) * 2f * math.PI;
            float radius = 5f + (index / 20) * 2f; // Expanding circles

            float3 offset = new float3(
                math.cos(angle) * radius,
                math.sin(angle) * radius,
                0
            );

            position = center + offset;
        }

        [BurstCompile]
        private static void GetColumnPosition(int index, in ZombieHordeSettings settings, in float3 center, out float3 position)
        {
            float3 offset = new float3(0, (index - 50) * settings.zombieSpacing.y, 0);
            position = center + offset;
        }

        [BurstCompile]
        private static void GetBlobPosition(int index, in ZombieHordeSettings settings, in float3 center, out float3 position)
        {
            // Loose blob formation with some randomness
            Unity.Mathematics.Random rand = new Unity.Mathematics.Random((uint)(index + 1));
            float radius = rand.NextFloat(5f, 15f);
            float angle = rand.NextFloat(0f, 2f * math.PI);

            float3 offset = new float3(
                math.cos(angle) * radius,
                math.sin(angle) * radius,
                0
            );

            position = center + offset;
        }
    }
}