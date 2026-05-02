using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Reactive on Barracks <see cref="BuildingTier"/> change — rebakes <see cref="BuildingHealth"/>, <see cref="ProvidesHealing"/>, <see cref="ProvidesSleep"/>, <see cref="ProvidesFood"/> and per-variant marker components per tier+variant. T0 Barracks: 400 HP, heal 2, sleep 5, food 1. T1 default Keep: 600 HP, heal 3, sleep 8, food 1. T1 alt 1 Stables: 420 HP, lighter heal + <see cref="BuildingSpeedAura"/> for cavalry-style speed boost. T1 alt 2 Guildhall: 400 HP, mid heal + <see cref="HeroRecruitTicker"/>. T2 Castle: 900 HP, heal 4, sleep 12, food 2. Damaged buildings preserve their damage ratio across rebake.</summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(BuildingUpgradeSystem))]
    public partial class BarracksTierServicesSystem : SystemBase
    {
        const uint HeroRecruitCadenceTicks = 180000u;

        EntityQuery _barracksWithTier;

        protected override void OnCreate()
        {
            _barracksWithTier = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<BarracksTag, BuildingTier, BuildingHealth>()
                .Build(EntityManager);
            _barracksWithTier.SetChangedVersionFilter(ComponentType.ReadOnly<BuildingTier>());
            RequireForUpdate(_barracksWithTier);
        }

        protected override void OnUpdate()
        {
            uint nowTick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);
            var entities = _barracksWithTier.ToEntityArray(Allocator.Temp);
            var em = EntityManager;

            for (int i = 0; i < entities.Length; i++)
            {
                var e = entities[i];
                byte tier    = em.GetComponentData<BuildingTier>(e).Value;
                byte variant = em.HasComponent<BuildingVariant>(e)
                    ? em.GetComponentData<BuildingVariant>(e).Value
                    : (byte)0;

                ApplyTier(em, e, tier, variant, nowTick);
            }
            entities.Dispose();
        }

        static void ApplyTier(EntityManager em, Entity barracks, byte tier, byte variant, uint nowTick)
        {
            ushort newMaxHp;
            byte healPriority, sleepCap, foodPriority;
            bool wantsSpeedAura = false;
            bool wantsHeroRecruit = false;

            switch (tier)
            {
                case 0:
                    newMaxHp = 400; healPriority = 2; sleepCap = 5; foodPriority = 1;
                    break;
                case 2:
                    newMaxHp = 900; healPriority = 4; sleepCap = 12; foodPriority = 2;
                    break;
                default:
                    if (variant == 1) // Stables
                    {
                        newMaxHp = 420; healPriority = 1; sleepCap = 6; foodPriority = 1;
                        wantsSpeedAura = true;
                    }
                    else if (variant == 2) // Guildhall
                    {
                        newMaxHp = 400; healPriority = 2; sleepCap = 6; foodPriority = 1;
                        wantsHeroRecruit = true;
                    }
                    else // Keep default
                    {
                        newMaxHp = 600; healPriority = 3; sleepCap = 8; foodPriority = 1;
                    }
                    break;
            }

            var hp = em.GetComponentData<BuildingHealth>(barracks);
            float ratio = hp.Max > 0 ? (float)hp.Value / hp.Max : 1f;
            hp.Max   = newMaxHp;
            hp.Value = (ushort)math.clamp((int)math.round(ratio * newMaxHp), 0, newMaxHp);
            em.SetComponentData(barracks, hp);

            SetOrAdd(em, barracks, new ProvidesHealing { Priority = healPriority });
            SetOrAdd(em, barracks, new ProvidesSleep   { Capacity = sleepCap });
            SetOrAdd(em, barracks, new ProvidesFood    { Priority = foodPriority });

            if (wantsSpeedAura)
                SetOrAdd(em, barracks, new BuildingSpeedAura { Magnitude = 1, Radius = 4 });
            else if (em.HasComponent<BuildingSpeedAura>(barracks))
                em.RemoveComponent<BuildingSpeedAura>(barracks);

            if (wantsHeroRecruit)
            {
                if (em.HasComponent<HeroRecruitTicker>(barracks))
                {
                    var t = em.GetComponentData<HeroRecruitTicker>(barracks);
                    t.CadenceTicks = HeroRecruitCadenceTicks;
                    em.SetComponentData(barracks, t);
                }
                else
                {
                    em.AddComponentData(barracks, new HeroRecruitTicker
                    {
                        NextRecruitTick = nowTick + HeroRecruitCadenceTicks,
                        CadenceTicks    = HeroRecruitCadenceTicks,
                    });
                }
            }
            else if (em.HasComponent<HeroRecruitTicker>(barracks))
            {
                em.RemoveComponent<HeroRecruitTicker>(barracks);
            }
        }

        static void SetOrAdd<T>(EntityManager em, Entity e, T value) where T : unmanaged, IComponentData
        {
            if (em.HasComponent<T>(e)) em.SetComponentData(e, value);
            else em.AddComponentData(e, value);
        }
    }
}
