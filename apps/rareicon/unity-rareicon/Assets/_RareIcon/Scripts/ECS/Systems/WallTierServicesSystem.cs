using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Reactive on Wall <see cref="BuildingTier"/> change — rebakes <see cref="BuildingHealth.Max"/> + <see cref="BuildingHealth.Value"/> per tier + variant. T0 Wall (260 HP) keeps the construction baseline. T1 default (ReinforcedWall): 360 HP. T1 alt 1 (Buttress): 540 HP — heavy iron HP soak. T1 alt 2 (Palisade): 180 HP — cheap timber. T2 FortifiedWall: 720 HP. Damaged walls preserve their damage ratio so an upgrade can't backfill HP for free.</summary>
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

        public void OnUpdate(ref SystemState state)
        {
            state.CompleteDependency();
            var entities      = _wallsWithTier.ToEntityArray(Allocator.Temp);
            var tierLookup    = SystemAPI.GetComponentLookup<BuildingTier>(true);
            var variantLookup = SystemAPI.GetComponentLookup<BuildingVariant>(true);
            var hpLookup      = SystemAPI.GetComponentLookup<BuildingHealth>(false);

            for (int i = 0; i < entities.Length; i++)
            {
                var e = entities[i];
                byte tier    = tierLookup[e].Value;
                byte variant = variantLookup.HasComponent(e) ? variantLookup[e].Value : (byte)0;
                ushort newMax = ResolveMaxHp(tier, variant);

                var hp = hpLookup[e];
                float ratio = hp.Max > 0 ? (float)hp.Value / hp.Max : 1f;
                hp.Max   = newMax;
                hp.Value = (ushort)math.clamp((int)math.round(ratio * newMax), 0, newMax);
                hpLookup[e] = hp;
            }
            entities.Dispose();
        }

        static ushort ResolveMaxHp(byte tier, byte variant)
        {
            if (tier >= 2) return 720;       // FortifiedWall
            if (tier == 1)
            {
                if (variant == 1) return 540; // Buttress
                if (variant == 2) return 180; // Palisade
                return 360;                   // ReinforcedWall
            }
            return 260;                       // base Wall
        }
    }
}
