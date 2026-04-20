using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Builders standing on a damaged Player-owned building hex tick its HP back up against WorldClock; awards Construction XP per repair tick. Builder priority covers both new construction (BuilderDepositSystem) and repair (this system) — same skill, same job slot.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(BuilderDepositSystem))]
    public partial class BuildingRepairSystem : SystemBase
    {
        const float  SecondsPerTick = 0.5f;
        const ushort HpPerTick      = 5;
        const ushort XPPerTick      = 6;

        protected override void OnCreate()
        {
            RequireForUpdate<WorldClock>();
        }

        protected override void OnUpdate()
        {
            float now = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;

            var hexOccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(isReadOnly: true);
            var healthLookup      = SystemAPI.GetComponentLookup<BuildingHealth>(isReadOnly: false);
            var skillXpLookup     = SystemAPI.GetComponentLookup<SkillXP>(isReadOnly: false);
            var siteLookup        = SystemAPI.GetComponentLookup<ConstructionSite>(isReadOnly: true);

            foreach (var (intent, movement, entity) in
                     SystemAPI.Query<RefRO<JobIntent>, RefRO<UnitMovement>>().WithEntityAccess())
            {
                if (intent.ValueRO.Kind != JobKind.Builder) continue;

                // Resolve the hex the unit is standing on to a building.
                // Repair is opportunistic — the unit just has to be on a
                // damaged Player building's hex; we don't require their
                // JobIntent to specifically target THIS building (a
                // builder en route to a site that crosses a damaged
                // building can still chip in for free).
                if (!HexHoverSystem.TryGetHexEntity(movement.ValueRO.CurrentHex, out var tile)) continue;
                if (!hexOccupantLookup.HasComponent(tile)) continue;

                Entity building = hexOccupantLookup[tile].Building;
                if (building == Entity.Null) continue;

                // Construction sites belong to BuilderDepositSystem;
                // repair only operates on completed buildings.
                if (siteLookup.HasComponent(building)) continue;
                if (!healthLookup.HasComponent(building)) continue;

                var hp = healthLookup[building];
                if (hp.Value >= hp.Max) continue;
                if (now - hp.LastRepairAbsSeconds < SecondsPerTick) continue;

                int restored = math.min(HpPerTick, hp.Max - hp.Value);
                hp.Value = (ushort)(hp.Value + restored);
                hp.LastRepairAbsSeconds = now;
                healthLookup[building] = hp;

                if (skillXpLookup.HasComponent(entity))
                {
                    var xp = skillXpLookup[entity];
                    int next = xp.Get(SkillKind.Construction) + XPPerTick;
                    xp.Set(SkillKind.Construction, (ushort)math.min(next, ushort.MaxValue));
                    skillXpLookup[entity] = xp;
                }
            }
        }
    }
}
