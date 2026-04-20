using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;

namespace RareIcon
{
    /// <summary>Promotes one pure-Looter goblin per freshly-staffed building. Capital→Builder, Farm→Farmer, Barracks→Guard, Furnace→Chef. Unspecialized = Looter>0 with every other role==0, so already-promoted goblins aren't poached. Tag persists when no candidate exists so a later tick retries.</summary>
    public struct StaffingRequest
    {
        public Entity Building;
        public byte   Role;
    }

    [BurstCompile]
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    public partial struct BuildingStaffingSystem : ISystem
    {
        const byte SpecialtyPriority = 5;

        EntityQuery _candidateQuery;
        EntityQuery _buildingQuery;

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            _candidateQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<Unit>()
                .WithAllRW<JobPriorities>()
                .Build(ref state);

            _buildingQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<Building, NeedsStaffing>()
                .WithNone<ConstructionSite>()
                .Build(ref state);

            state.RequireForUpdate(_buildingQuery);
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var requests = new NativeList<StaffingRequest>(8, Allocator.TempJob);

            foreach (var (building, entity) in
                     SystemAPI.Query<RefRO<Building>>()
                              .WithAll<NeedsStaffing>()
                              .WithNone<ConstructionSite>()
                              .WithEntityAccess())
            {
                requests.Add(new StaffingRequest
                {
                    Building = entity,
                    Role     = RoleForBuilding(building.ValueRO.Type),
                });
            }

            if (requests.Length == 0)
            {
                requests.Dispose();
                return;
            }

            var candidates = _candidateQuery.ToEntityArray(Allocator.TempJob);
            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            state.Dependency = new StaffingAssignJob
            {
                Requests          = requests,
                Candidates        = candidates,
                PrioritiesLookup  = SystemAPI.GetComponentLookup<JobPriorities>(false),
                SpecialtyPriority = SpecialtyPriority,
                Ecb               = ecb,
            }.Schedule(state.Dependency);

            state.Dependency = requests.Dispose(state.Dependency);
            state.Dependency = candidates.Dispose(state.Dependency);
        }

        static byte RoleForBuilding(byte buildingType) => buildingType switch
        {
            BuildingType.Capital  => JobKind.Builder,
            BuildingType.Farm     => JobKind.Farmer,
            BuildingType.Barracks => JobKind.Guard,
            BuildingType.Furnace  => JobKind.Chef,
            _                     => JobKind.None,
        };
    }

    [BurstCompile]
    public struct StaffingAssignJob : IJob
    {
        [ReadOnly] public NativeList<StaffingRequest> Requests;
        [ReadOnly] public NativeArray<Entity>         Candidates;

        public ComponentLookup<JobPriorities> PrioritiesLookup;
        public EntityCommandBuffer            Ecb;
        public byte                           SpecialtyPriority;

        public void Execute()
        {
            for (int i = 0; i < Requests.Length; i++)
            {
                var req = Requests[i];
                if (req.Role == JobKind.None)
                {
                    Ecb.RemoveComponent<NeedsStaffing>(req.Building);
                    continue;
                }

                for (int c = 0; c < Candidates.Length; c++)
                {
                    var cand = Candidates[c];
                    if (!PrioritiesLookup.HasComponent(cand)) continue;
                    var prios = PrioritiesLookup[cand];
                    if (!IsPureLooter(prios)) continue;

                    prios.Set(req.Role, SpecialtyPriority);
                    PrioritiesLookup[cand] = prios;
                    Ecb.RemoveComponent<NeedsStaffing>(req.Building);
                    break;
                }
            }
        }

        static bool IsPureLooter(in JobPriorities p)
        {
            if (p.Looter == 0) return false;
            return p.Lumberjack == 0
                && p.Miner      == 0
                && p.Guard      == 0
                && p.Farmer     == 0
                && p.Builder    == 0
                && p.Chef       == 0
                && p.Hunter     == 0;
        }
    }
}
