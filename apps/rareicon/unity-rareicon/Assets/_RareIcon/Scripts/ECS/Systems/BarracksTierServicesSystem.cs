using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Reactive on Barracks <see cref="BuildingTier"/> change — rebakes <see cref="BuildingHealth"/>, <see cref="ProvidesHealing"/>, <see cref="ProvidesSleep"/>, <see cref="ProvidesFood"/> and per-variant marker components per tier+variant. T0 Barracks: 400 HP, heal 2, sleep 5, food 1. T1 default Keep: 600 HP, heal 3, sleep 8, food 1. T1 alt 1 Stables: 420 HP, lighter heal + <see cref="BuildingSpeedAura"/>. T1 alt 2 Guildhall: 400 HP, mid heal + <see cref="HeroRecruitTicker"/>. T2 Castle: 900 HP, heal 4, sleep 12, food 2. Off-main-thread parallel <see cref="BarracksRebakeJob"/> + ECB.ParallelWriter.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(BuildingUpgradeSystem))]
    public partial struct BarracksTierServicesSystem : ISystem
    {
        const uint HeroRecruitCadenceTicks = 180000u;

        EntityQuery _barracksWithTier;

        public void OnCreate(ref SystemState state)
        {
            _barracksWithTier = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<BarracksTag, BuildingTier, BuildingHealth>()
                .Build(ref state);
            _barracksWithTier.SetChangedVersionFilter(ComponentType.ReadOnly<BuildingTier>());
            state.RequireForUpdate(_barracksWithTier);
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged).AsParallelWriter();
            uint nowTick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);

            state.Dependency = new BarracksRebakeJob
            {
                NowTick           = nowTick,
                Cadence           = HeroRecruitCadenceTicks,
                VariantLookup     = SystemAPI.GetComponentLookup<BuildingVariant>(true),
                HealLookup        = SystemAPI.GetComponentLookup<ProvidesHealing>(true),
                SleepLookup       = SystemAPI.GetComponentLookup<ProvidesSleep>(true),
                FoodLookup        = SystemAPI.GetComponentLookup<ProvidesFood>(true),
                SpeedAuraLookup   = SystemAPI.GetComponentLookup<BuildingSpeedAura>(true),
                HeroTickerLookup  = SystemAPI.GetComponentLookup<HeroRecruitTicker>(true),
                Ecb               = ecb,
            }.ScheduleParallel(_barracksWithTier, state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct BarracksRebakeJob : IJobEntity
    {
        public uint NowTick;
        public uint Cadence;
        [ReadOnly] public ComponentLookup<BuildingVariant>   VariantLookup;
        [ReadOnly] public ComponentLookup<ProvidesHealing>   HealLookup;
        [ReadOnly] public ComponentLookup<ProvidesSleep>     SleepLookup;
        [ReadOnly] public ComponentLookup<ProvidesFood>      FoodLookup;
        [ReadOnly] public ComponentLookup<BuildingSpeedAura> SpeedAuraLookup;
        [ReadOnly] public ComponentLookup<HeroRecruitTicker> HeroTickerLookup;
        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity barracks,
                     [ChunkIndexInQuery] int chunkIdx,
                     in BuildingTier tier,
                     ref BuildingHealth hp)
        {
            byte t = tier.Value;
            byte v = VariantLookup.HasComponent(barracks) ? VariantLookup[barracks].Value : (byte)0;

            ushort newMaxHp;
            byte healPriority, sleepCap, foodPriority;
            bool wantsSpeedAura = false;
            bool wantsHeroRecruit = false;

            switch (t)
            {
                case 0:
                    newMaxHp = 400; healPriority = 2; sleepCap = 5; foodPriority = 1;
                    break;
                case 2:
                    newMaxHp = 900; healPriority = 4; sleepCap = 12; foodPriority = 2;
                    break;
                default:
                    if (v == 1)
                    {
                        newMaxHp = 420; healPriority = 1; sleepCap = 6; foodPriority = 1;
                        wantsSpeedAura = true;
                    }
                    else if (v == 2)
                    {
                        newMaxHp = 400; healPriority = 2; sleepCap = 6; foodPriority = 1;
                        wantsHeroRecruit = true;
                    }
                    else
                    {
                        newMaxHp = 600; healPriority = 3; sleepCap = 8; foodPriority = 1;
                    }
                    break;
            }

            float ratio = hp.Max > 0 ? (float)hp.Value / hp.Max : 1f;
            hp.Max   = newMaxHp;
            hp.Value = (ushort)math.clamp((int)math.round(ratio * newMaxHp), 0, newMaxHp);

            SetOrAdd(chunkIdx, barracks, new ProvidesHealing { Priority = healPriority }, HealLookup.HasComponent(barracks));
            SetOrAdd(chunkIdx, barracks, new ProvidesSleep   { Capacity = sleepCap },     SleepLookup.HasComponent(barracks));
            SetOrAdd(chunkIdx, barracks, new ProvidesFood    { Priority = foodPriority }, FoodLookup.HasComponent(barracks));

            if (wantsSpeedAura)
                SetOrAdd(chunkIdx, barracks, new BuildingSpeedAura { Magnitude = 1, Radius = 4 }, SpeedAuraLookup.HasComponent(barracks));
            else if (SpeedAuraLookup.HasComponent(barracks))
                Ecb.RemoveComponent<BuildingSpeedAura>(chunkIdx, barracks);

            if (wantsHeroRecruit)
            {
                if (HeroTickerLookup.HasComponent(barracks))
                {
                    var ticker = HeroTickerLookup[barracks];
                    ticker.CadenceTicks = Cadence;
                    Ecb.SetComponent(chunkIdx, barracks, ticker);
                }
                else
                {
                    Ecb.AddComponent(chunkIdx, barracks, new HeroRecruitTicker
                    {
                        NextRecruitTick = NowTick + Cadence,
                        CadenceTicks    = Cadence,
                    });
                }
            }
            else if (HeroTickerLookup.HasComponent(barracks))
            {
                Ecb.RemoveComponent<HeroRecruitTicker>(chunkIdx, barracks);
            }
        }

        void SetOrAdd<T>(int chunkIdx, Entity e, T value, bool exists) where T : unmanaged, IComponentData
        {
            if (exists) Ecb.SetComponent(chunkIdx, e, value);
            else        Ecb.AddComponent(chunkIdx, e, value);
        }
    }
}
