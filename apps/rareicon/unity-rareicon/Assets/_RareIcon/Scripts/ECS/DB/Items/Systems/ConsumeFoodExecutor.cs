using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Executor for ReliefKind.Eat — Meal gets special-case full-stat restore gated by Sated; everything else pops one edible per tick and drops Hunger by the item's EnergyValue. Burst ScheduleParallel: every unit writes only its own Health/Mana/Energy/PackSlot components (NDFR annotations on ComponentLookup are safe because each Execute touches a single entity), Sated structural change queues through ECB.ParallelWriter.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(EmpireSharingSystem))]
    public partial struct ConsumeFoodExecutor : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<ItemDBSingleton>(out var db)) return;

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged).AsParallelWriter();

            state.Dependency = new ConsumeFoodJob
            {
                Db           = db,
                HealthLookup = SystemAPI.GetComponentLookup<Health>(false),
                ManaLookup   = SystemAPI.GetComponentLookup<Mana>(false),
                EnergyLookup = SystemAPI.GetComponentLookup<Energy>(false),
                SatedLookup  = SystemAPI.GetComponentLookup<Sated>(false),
                Ecb          = ecb,
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct ConsumeFoodJob : IJobEntity
    {
        const float SatedDurationSec = 60f;
        const int   MaxConsumePerTick = 10;

        [ReadOnly] public ItemDBSingleton Db;

        [NativeDisableParallelForRestriction] public ComponentLookup<Health> HealthLookup;
        [NativeDisableParallelForRestriction] public ComponentLookup<Mana>   ManaLookup;
        [NativeDisableParallelForRestriction] public ComponentLookup<Energy> EnergyLookup;
        [NativeDisableParallelForRestriction] public ComponentLookup<Sated>  SatedLookup;

        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute([ChunkIndexInQuery] int chunkIdx,
                     Entity entity,
                     ref Hunger hunger,
                     in ReliefIntent intent,
                     ref DynamicBuffer<PackSlot> inv)
        {
            if (intent.Kind != ReliefKind.Eat) return;
            if (hunger.Max <= 0f) return;

            // Meal fast-path — look for a Meal slot first and fire the full
            // restore. Hunger zeroes unconditionally; HP/Mana/Energy restore
            // only if not Sated. Sated timer refreshes on every Meal consume.
            for (int i = 0; i < inv.Length; i++)
            {
                if (inv[i].Count == 0) continue;
                if (inv[i].ItemId != (ushort)ItemId.Meal) continue;

                var slot = inv[i];
                slot.Count -= 1;
                inv[i] = slot;

                hunger.Value = 0f;

                bool sated = SatedLookup.HasComponent(entity);
                if (!sated)
                {
                    if (HealthLookup.HasComponent(entity))
                    {
                        var h = HealthLookup[entity];
                        h.Value = h.Max;
                        HealthLookup[entity] = h;
                    }
                    if (ManaLookup.HasComponent(entity))
                    {
                        var m = ManaLookup[entity];
                        m.Value = m.Max;
                        ManaLookup[entity] = m;
                    }
                    if (EnergyLookup.HasComponent(entity))
                    {
                        var e = EnergyLookup[entity];
                        e.Value = e.Max;
                        EnergyLookup[entity] = e;
                    }
                    Ecb.AddComponent(chunkIdx, entity, new Sated { SecondsRemaining = SatedDurationSec });
                }
                else
                {
                    var s = SatedLookup[entity];
                    s.SecondsRemaining = SatedDurationSec;
                    SatedLookup[entity] = s;
                }
                return;
            }

            // Ordinary edible burst — pop up to MaxConsumePerTick items
            // until hunger is below the exit threshold OR inventory has no
            // more edible. Replaces the single-pop-per-tick loop so a
            // freshly-arrived hungry unit clears relief in one frame
            // instead of N frames, eliminating the starvation-mid-meal race.
            float exitAbs = hunger.Max * ReliefSystem.HungerExit;
            int eaten = 0;
            while (eaten < MaxConsumePerTick && hunger.Value > exitAbs)
            {
                bool ate = false;
                for (int i = 0; i < inv.Length; i++)
                {
                    var slot = inv[i];
                    if (slot.Count == 0) continue;
                    float gain = Db.EnergyValue(slot.ItemId);
                    if (gain <= 0f) continue;

                    slot.Count -= 1;
                    inv[i] = slot;

                    hunger.Value = math.max(0f, hunger.Value - gain);
                    eaten++;
                    ate = true;
                    break;
                }
                if (!ate) return;
            }
        }
    }
}
