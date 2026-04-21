using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Builders on a damaged Player-owned building tick its HP back up against WorldClock, awarding Construction XP. Opportunistic — any Builder-intent unit on a damaged hex contributes. Shared BuildingHealth → single-worker Schedule.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(BuilderDepositSystem))]
    public partial struct BuildingRepairSystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state) => state.RequireForUpdate<WorldClock>();

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<HexLookupSingleton>(out var hexLookupSingleton)) return;
            float now = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;

            state.Dependency = new BuildingRepairJob
            {
                Now               = now,
                HexLookup         = hexLookupSingleton.Lookup,
                HexOccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(true),
                HealthLookup      = SystemAPI.GetComponentLookup<BuildingHealth>(false),
                SiteLookup        = SystemAPI.GetComponentLookup<ConstructionSite>(true),
                SkillXpLookup     = SystemAPI.GetComponentLookup<SkillXP>(false),
            }.Schedule(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct BuildingRepairJob : IJobEntity
    {
        const float  SecondsPerTick = 0.5f;
        const ushort HpPerTick      = 5;
        const ushort XPPerTick      = 6;

        public float Now;

        [ReadOnly] public NativeHashMap<int2, Entity>       HexLookup;
        [ReadOnly] public ComponentLookup<HexOccupant>      HexOccupantLookup;
        [ReadOnly] public ComponentLookup<ConstructionSite> SiteLookup;

        [NativeDisableParallelForRestriction] public ComponentLookup<BuildingHealth> HealthLookup;
        [NativeDisableParallelForRestriction] public ComponentLookup<SkillXP>        SkillXpLookup;

        void Execute(Entity entity, in ProfessionIntent intent, in UnitMovement movement)
        {
            if (intent.Kind != ProfessionKind.Builder) return;

            if (!HexLookup.TryGetValue(movement.CurrentHex, out var tile)) return;
            if (!HexOccupantLookup.HasComponent(tile)) return;

            Entity building = HexOccupantLookup[tile].Building;
            if (building == Entity.Null) return;
            if (SiteLookup.HasComponent(building)) return;
            if (!HealthLookup.HasComponent(building)) return;

            var hp = HealthLookup[building];
            if (hp.Value >= hp.Max) return;
            if (Now - hp.LastRepairAbsSeconds < SecondsPerTick) return;

            int restored = math.min(HpPerTick, hp.Max - hp.Value);
            hp.Value = (ushort)(hp.Value + restored);
            hp.LastRepairAbsSeconds = Now;
            HealthLookup[building] = hp;

            if (SkillXpLookup.HasComponent(entity))
            {
                var xp = SkillXpLookup[entity];
                int next = xp.Get(SkillKind.Construction) + XPPerTick;
                xp.Set(SkillKind.Construction, (ushort)math.min(next, ushort.MaxValue));
                SkillXpLookup[entity] = xp;
            }
        }
    }
}
