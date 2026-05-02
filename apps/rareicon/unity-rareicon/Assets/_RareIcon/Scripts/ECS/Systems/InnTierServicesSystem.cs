using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Keeps an Inn's ProvidesFood / ProvidesSleep / ProvidesHealing / ProvidesDrink / ProvidesMorale / InnMusicTrack / InnAmbientAura in sync with its BuildingTier + BuildingVariant. Tier 0 = Inn, Tier 1 default (variant 0) = Tavern, Tier 1 alt (variant 1) = AleHouse (brewing focus — heal off, drink + morale up, bigger aura), Tier 2 = Lodge. Reactive on the BuildingTier change filter so the work fires once per upgrade, not every frame.</summary>
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
                               .CreateCommandBuffer(state.WorldUnmanaged);

            var entities = _innsWithTier.ToEntityArray(Unity.Collections.Allocator.Temp);
            var tierLookup    = SystemAPI.GetComponentLookup<BuildingTier>(true);
            var variantLookup = SystemAPI.GetComponentLookup<BuildingVariant>(true);
            var foodLookup    = SystemAPI.GetComponentLookup<ProvidesFood>(true);
            var sleepLookup   = SystemAPI.GetComponentLookup<ProvidesSleep>(true);
            var healLookup    = SystemAPI.GetComponentLookup<ProvidesHealing>(true);
            var boardLookup   = SystemAPI.GetComponentLookup<QuestBoardState>(true);
            var moraleLookup  = SystemAPI.GetComponentLookup<ProvidesMorale>(true);
            var drinkLookup   = SystemAPI.GetComponentLookup<ProvidesDrink>(true);
            var musicLookup   = SystemAPI.GetComponentLookup<InnMusicTrack>(true);
            var auraLookup    = SystemAPI.GetComponentLookup<InnAmbientAura>(true);

            for (int i = 0; i < entities.Length; i++)
            {
                var e = entities[i];
                byte tier    = tierLookup[e].Value;
                byte variant = variantLookup.HasComponent(e) ? variantLookup[e].Value : (byte)0;

                ApplyFood(ecb, e, tier, foodLookup);
                ApplySleep(ecb, e, tier, variant, sleepLookup);
                ApplyHealing(ecb, e, tier, variant, healLookup);
                ApplyQuestBoard(ecb, e, tier, boardLookup);
                ApplyMorale(ecb, e, tier, variant, moraleLookup);
                ApplyDrink(ecb, e, tier, variant, drinkLookup);
                ApplyMusic(ecb, e, tier, variant, musicLookup, auraLookup);
            }
            entities.Dispose();
        }

        static void ApplyFood(EntityCommandBuffer ecb, Entity e, byte tier,
                              ComponentLookup<ProvidesFood> lookup)
        {
            byte priority = (byte)(1 + tier);
            if (lookup.HasComponent(e))
                ecb.SetComponent(e, new ProvidesFood { Priority = priority });
            else
                ecb.AddComponent(e,  new ProvidesFood { Priority = priority });
        }

        static void ApplySleep(EntityCommandBuffer ecb, Entity e, byte tier, byte variant,
                               ComponentLookup<ProvidesSleep> lookup)
        {
            // AleHouse trades sleep capacity for drink + morale — patrons
            // pile in for the brew, not the bunks.
            byte cap = tier switch
            {
                0 => 5,
                1 => (variant == 1) ? (byte)6 : (byte)8,
                _ => 12,
            };
            if (lookup.HasComponent(e))
                ecb.SetComponent(e, new ProvidesSleep { Capacity = cap });
            else
                ecb.AddComponent(e,  new ProvidesSleep { Capacity = cap });
        }

        static void ApplyHealing(EntityCommandBuffer ecb, Entity e, byte tier, byte variant,
                                 ComponentLookup<ProvidesHealing> lookup)
        {
            // AleHouse drops healing entirely — its angle is morale + drink,
            // not medicine. Tavern + Lodge keep heal.
            if (tier == 0 || (tier == 1 && variant == 1))
            {
                if (lookup.HasComponent(e)) ecb.RemoveComponent<ProvidesHealing>(e);
                return;
            }
            byte priority = tier == 1 ? (byte)1 : (byte)2;
            if (lookup.HasComponent(e))
                ecb.SetComponent(e, new ProvidesHealing { Priority = priority });
            else
                ecb.AddComponent(e,  new ProvidesHealing { Priority = priority });
        }

        static void ApplyQuestBoard(EntityCommandBuffer ecb, Entity e, byte tier,
                                    ComponentLookup<QuestBoardState> lookup)
        {
            if (tier == 0)
            {
                if (lookup.HasComponent(e))
                {
                    ecb.RemoveComponent<QuestBoardState>(e);
                    ecb.RemoveComponent<QuestBoardSlot>(e);
                }
                return;
            }
            byte capacity = tier == 1 ? (byte)3 : (byte)5;
            if (lookup.HasComponent(e))
            {
                ecb.SetComponent(e, new QuestBoardState { NextRefreshTurn = 0, Capacity = capacity });
            }
            else
            {
                ecb.AddComponent(e, new QuestBoardState { NextRefreshTurn = 0, Capacity = capacity });
                ecb.AddBuffer<QuestBoardSlot>(e);
            }
        }

        static void ApplyMorale(EntityCommandBuffer ecb, Entity e, byte tier, byte variant,
                                ComponentLookup<ProvidesMorale> lookup)
        {
            if (tier == 0)
            {
                if (lookup.HasComponent(e)) ecb.RemoveComponent<ProvidesMorale>(e);
                return;
            }
            // AleHouse leans into festive — bumps morale magnitude one band
            // above Tavern at the same tier.
            byte mag = tier switch
            {
                1 => (variant == 1) ? (byte)2 : (byte)1,
                _ => 2,
            };
            if (lookup.HasComponent(e))
                ecb.SetComponent(e, new ProvidesMorale { Magnitude = mag });
            else
                ecb.AddComponent(e,  new ProvidesMorale { Magnitude = mag });
        }

        static void ApplyDrink(EntityCommandBuffer ecb, Entity e, byte tier, byte variant,
                               ComponentLookup<ProvidesDrink> lookup)
        {
            if (tier == 0)
            {
                if (lookup.HasComponent(e)) ecb.RemoveComponent<ProvidesDrink>(e);
                return;
            }
            // AleHouse + Lodge share peak drink quality (2); Tavern stays
            // at 1 unless brewing-specialised.
            byte quality = tier switch
            {
                1 => (variant == 1) ? (byte)2 : (byte)1,
                _ => 2,
            };
            if (lookup.HasComponent(e))
                ecb.SetComponent(e, new ProvidesDrink { Quality = quality });
            else
                ecb.AddComponent(e,  new ProvidesDrink { Quality = quality });
        }

        static void ApplyMusic(EntityCommandBuffer ecb, Entity e, byte tier, byte variant,
                               ComponentLookup<InnMusicTrack>   trackLookup,
                               ComponentLookup<InnAmbientAura>  auraLookup)
        {
            // Track id encodes tier in the low bits + variant in bit 4 so a
            // future audio bridge can pick distinct loops per pick.
            ushort trackId = (ushort)(tier | (variant << 4));
            // AleHouse's festival aura reaches further than the standard Tavern.
            byte   radius  = tier switch
            {
                0 => 0,
                1 => (variant == 1) ? (byte)4 : (byte)3,
                _ => 5,
            };

            if (trackLookup.HasComponent(e))
                ecb.SetComponent(e, new InnMusicTrack { TrackId = trackId });
            else
                ecb.AddComponent(e,  new InnMusicTrack { TrackId = trackId });

            if (radius == 0)
            {
                if (auraLookup.HasComponent(e)) ecb.RemoveComponent<InnAmbientAura>(e);
                return;
            }
            if (auraLookup.HasComponent(e))
                ecb.SetComponent(e, new InnAmbientAura { Radius = radius });
            else
                ecb.AddComponent(e,  new InnAmbientAura { Radius = radius });
        }
    }
}
