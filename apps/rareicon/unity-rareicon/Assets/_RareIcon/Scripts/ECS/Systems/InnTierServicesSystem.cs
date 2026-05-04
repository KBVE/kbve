using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Keeps an Inn's ProvidesFood / ProvidesSleep / ProvidesHealing / ProvidesDrink / ProvidesMorale / InnMusicTrack / InnAmbientAura in sync with its BuildingTier + BuildingVariant. Tier 0 = Inn, Tier 1 default (variant 0) = Tavern, Tier 1 alt (variant 1) = AleHouse (brewing focus — heal off, drink + morale up, bigger aura), Tier 2 = Lodge. Reactive on the BuildingTier change filter so the work fires once per upgrade, not every frame. Off-main-thread parallel <see cref="InnRebakeJob"/> + ECB.ParallelWriter for every component add/set/remove.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(BuildingUpgradeSystem))]
    public partial struct InnTierServicesSystem : ISystem
    {
        EntityQuery _innsWithTier;

        public void OnCreate(ref SystemState state)
        {
            _innsWithTier = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<InnTag, BuildingTier>()
                .Build(ref state);
            _innsWithTier.SetChangedVersionFilter(ComponentType.ReadOnly<BuildingTier>());
            state.RequireForUpdate(_innsWithTier);
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged).AsParallelWriter();

            state.Dependency = new InnRebakeJob
            {
                VariantLookup = SystemAPI.GetComponentLookup<BuildingVariant>(true),
                HpLookup      = SystemAPI.GetComponentLookup<BuildingHealth>(true),
                FoodLookup    = SystemAPI.GetComponentLookup<ProvidesFood>(true),
                SleepLookup   = SystemAPI.GetComponentLookup<ProvidesSleep>(true),
                HealLookup    = SystemAPI.GetComponentLookup<ProvidesHealing>(true),
                BoardLookup   = SystemAPI.GetComponentLookup<QuestBoardState>(true),
                MoraleLookup  = SystemAPI.GetComponentLookup<ProvidesMorale>(true),
                DrinkLookup   = SystemAPI.GetComponentLookup<ProvidesDrink>(true),
                MusicLookup   = SystemAPI.GetComponentLookup<InnMusicTrack>(true),
                AuraLookup    = SystemAPI.GetComponentLookup<InnAmbientAura>(true),
                Ecb           = ecb,
            }.ScheduleParallel(_innsWithTier, state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct InnRebakeJob : IJobEntity
    {
        [ReadOnly] public ComponentLookup<BuildingVariant> VariantLookup;
        [ReadOnly] public ComponentLookup<BuildingHealth>  HpLookup;
        [ReadOnly] public ComponentLookup<ProvidesFood>    FoodLookup;
        [ReadOnly] public ComponentLookup<ProvidesSleep>   SleepLookup;
        [ReadOnly] public ComponentLookup<ProvidesHealing> HealLookup;
        [ReadOnly] public ComponentLookup<QuestBoardState> BoardLookup;
        [ReadOnly] public ComponentLookup<ProvidesMorale>  MoraleLookup;
        [ReadOnly] public ComponentLookup<ProvidesDrink>   DrinkLookup;
        [ReadOnly] public ComponentLookup<InnMusicTrack>   MusicLookup;
        [ReadOnly] public ComponentLookup<InnAmbientAura>  AuraLookup;
        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity e, [ChunkIndexInQuery] int chunkIdx, in BuildingTier tier)
        {
            byte t = tier.Value;
            byte v = VariantLookup.HasComponent(e) ? VariantLookup[e].Value : (byte)0;

            ApplyFood(chunkIdx, e, t);
            ApplySleep(chunkIdx, e, t, v);
            ApplyHealing(chunkIdx, e, t, v);
            ApplyQuestBoard(chunkIdx, e, t);
            ApplyMorale(chunkIdx, e, t, v);
            ApplyDrink(chunkIdx, e, t, v);
            ApplyMusic(chunkIdx, e, t, v);
            ApplyMaxHealth(chunkIdx, e, t, v);
        }

        void ApplyFood(int chunkIdx, Entity e, byte tier)
        {
            byte priority = (byte)(1 + tier);
            if (FoodLookup.HasComponent(e))
                Ecb.SetComponent(chunkIdx, e, new ProvidesFood { Priority = priority });
            else
                Ecb.AddComponent(chunkIdx, e,  new ProvidesFood { Priority = priority });
        }

        void ApplySleep(int chunkIdx, Entity e, byte tier, byte variant)
        {
            byte cap = tier switch
            {
                0 => 5,
                1 => (variant == 1) ? (byte)6 : (byte)8,
                _ => 12,
            };
            if (SleepLookup.HasComponent(e))
                Ecb.SetComponent(chunkIdx, e, new ProvidesSleep { Capacity = cap });
            else
                Ecb.AddComponent(chunkIdx, e,  new ProvidesSleep { Capacity = cap });
        }

        void ApplyHealing(int chunkIdx, Entity e, byte tier, byte variant)
        {
            if (tier == 0 || (tier == 1 && variant == 1))
            {
                if (HealLookup.HasComponent(e)) Ecb.RemoveComponent<ProvidesHealing>(chunkIdx, e);
                return;
            }
            byte priority = tier == 1 ? (byte)1 : (byte)2;
            if (HealLookup.HasComponent(e))
                Ecb.SetComponent(chunkIdx, e, new ProvidesHealing { Priority = priority });
            else
                Ecb.AddComponent(chunkIdx, e,  new ProvidesHealing { Priority = priority });
        }

        void ApplyQuestBoard(int chunkIdx, Entity e, byte tier)
        {
            if (tier == 0)
            {
                if (BoardLookup.HasComponent(e))
                {
                    Ecb.RemoveComponent<QuestBoardState>(chunkIdx, e);
                    Ecb.RemoveComponent<QuestBoardSlot>(chunkIdx, e);
                }
                return;
            }
            byte capacity = tier == 1 ? (byte)3 : (byte)5;
            if (BoardLookup.HasComponent(e))
            {
                Ecb.SetComponent(chunkIdx, e, new QuestBoardState { NextRefreshTurn = 0, Capacity = capacity });
            }
            else
            {
                Ecb.AddComponent(chunkIdx, e, new QuestBoardState { NextRefreshTurn = 0, Capacity = capacity });
                Ecb.AddBuffer<QuestBoardSlot>(chunkIdx, e);
            }
        }

        void ApplyMorale(int chunkIdx, Entity e, byte tier, byte variant)
        {
            if (tier == 0)
            {
                if (MoraleLookup.HasComponent(e)) Ecb.RemoveComponent<ProvidesMorale>(chunkIdx, e);
                return;
            }
            byte mag = tier switch
            {
                1 => (variant == 1) ? (byte)2 : (byte)1,
                _ => 2,
            };
            if (MoraleLookup.HasComponent(e))
                Ecb.SetComponent(chunkIdx, e, new ProvidesMorale { Magnitude = mag });
            else
                Ecb.AddComponent(chunkIdx, e,  new ProvidesMorale { Magnitude = mag });
        }

        void ApplyDrink(int chunkIdx, Entity e, byte tier, byte variant)
        {
            if (tier == 0)
            {
                if (DrinkLookup.HasComponent(e)) Ecb.RemoveComponent<ProvidesDrink>(chunkIdx, e);
                return;
            }
            byte quality = tier switch
            {
                1 => (variant == 1) ? (byte)2 : (byte)1,
                _ => 2,
            };
            if (DrinkLookup.HasComponent(e))
                Ecb.SetComponent(chunkIdx, e, new ProvidesDrink { Quality = quality });
            else
                Ecb.AddComponent(chunkIdx, e,  new ProvidesDrink { Quality = quality });
        }

        void ApplyMusic(int chunkIdx, Entity e, byte tier, byte variant)
        {
            ushort trackId = (ushort)(tier | (variant << 4));
            byte radius = tier switch
            {
                0 => 0,
                1 => (variant == 1) ? (byte)4 : (byte)3,
                _ => 5,
            };

            if (MusicLookup.HasComponent(e))
                Ecb.SetComponent(chunkIdx, e, new InnMusicTrack { TrackId = trackId });
            else
                Ecb.AddComponent(chunkIdx, e,  new InnMusicTrack { TrackId = trackId });

            if (radius == 0)
            {
                if (AuraLookup.HasComponent(e)) Ecb.RemoveComponent<InnAmbientAura>(chunkIdx, e);
                return;
            }
            if (AuraLookup.HasComponent(e))
                Ecb.SetComponent(chunkIdx, e, new InnAmbientAura { Radius = radius });
            else
                Ecb.AddComponent(chunkIdx, e,  new InnAmbientAura { Radius = radius });
        }

        void ApplyMaxHealth(int chunkIdx, Entity e, byte tier, byte variant)
        {
            if (!HpLookup.HasComponent(e)) return;
            ushort newMax = tier switch
            {
                0 => 280,
                2 => 460,
                _ => (variant == 1) ? (ushort)280 : (ushort)360,
            };
            var hp = HpLookup[e];
            float ratio = hp.Max > 0 ? (float)hp.Value / hp.Max : 1f;
            hp.Max   = newMax;
            hp.Value = (ushort)math.clamp((int)math.round(ratio * newMax), 0, newMax);
            Ecb.SetComponent(chunkIdx, e, hp);
        }
    }
}
