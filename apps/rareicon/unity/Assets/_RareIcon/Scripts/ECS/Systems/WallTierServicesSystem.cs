using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Reactive on Wall <see cref="BuildingTier"/> change — rebakes <see cref="BuildingHealth.Max"/> + <see cref="BuildingHealth.Value"/> per tier + variant. T0 Wall (260 HP) keeps the construction baseline. T1 default (ReinforcedWall): 360 HP. T1 alt 1 (Buttress): 540 HP — heavy iron HP soak. T1 alt 2 (Palisade): 180 HP — cheap timber. T2 FortifiedWall: 720 HP. Damaged walls preserve their damage ratio so an upgrade can't backfill HP for free. Off-main-thread via parallel <see cref="WallRebakeHpJob"/> — chains on <c>state.Dependency</c> so the main thread never stalls on the prior frame's BuildingDeathJob / damage writes.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(BuildingUpgradeSystem))]
    public partial struct WallTierServicesSystem : ISystem
    {
        EntityQuery _wallsWithTier;

        public void OnCreate(ref SystemState state)
        {
            _wallsWithTier = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<WallTag, BuildingTier, BuildingHealth>()
                .Build(ref state);
            _wallsWithTier.SetChangedVersionFilter(ComponentType.ReadOnly<BuildingTier>());
            state.RequireForUpdate(_wallsWithTier);
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            state.Dependency = new WallRebakeHpJob
            {
                VariantLookup = SystemAPI.GetComponentLookup<BuildingVariant>(true),
            }.ScheduleParallel(_wallsWithTier, state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct WallRebakeHpJob : IJobEntity
    {
        [ReadOnly] public ComponentLookup<BuildingVariant> VariantLookup;

        void Execute(Entity entity, in BuildingTier tier, ref BuildingHealth hp)
        {
            byte variantValue = VariantLookup.HasComponent(entity) ? VariantLookup[entity].Value : (byte)0;
            ushort newMax = ResolveMaxHp(tier.Value, variantValue);
            float ratio = hp.Max > 0 ? (float)hp.Value / hp.Max : 1f;
            hp.Max   = newMax;
            hp.Value = (ushort)math.clamp((int)math.round(ratio * newMax), 0, newMax);
        }

        static ushort ResolveMaxHp(byte tier, byte variant)
        {
            if (tier >= 2) return 720;
            if (tier == 1)
            {
                if (variant == 1) return 540;
                if (variant == 2) return 180;
                return 360;
            }
            return 260;
        }
    }
}
