using MessagePipe;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Per-camp tier evolution. While a BanditCamp sits at full <see cref="BuildingHealth"/>, the evolve clock counts down; once it elapses, <see cref="BanditCampGrowth.Tier"/> advances 0 → 1 → 2 and the camp's HP / raid party / raid cadence / territory radius all scale up. Any damage resets the clock — the player can deny evolution by keeping pressure on the camp. Toast fires per tier-up so the player gets a visible escalation cue. Main-thread SystemBase because <see cref="GlobalMessagePipe"/> publishes are managed.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(BanditCampSpawnerSystem))]
    public partial class BanditCampEvolutionSystem : SystemBase
    {
        IPublisher<ToastMessage> _toastPub;

        protected override void OnCreate()
        {
            RequireForUpdate<BanditCampGrowth>();
        }

        protected override void OnUpdate()
        {
            uint nowTick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);

            foreach (var (growthRef, stateRef, hpRef, territoryRef) in
                     SystemAPI.Query<RefRW<BanditCampGrowth>,
                                     RefRW<BanditCampState>,
                                     RefRW<BuildingHealth>,
                                     RefRW<TerritoryEmitter>>()
                              .WithAll<BanditCampTag>())
            {
                ref var growth    = ref growthRef.ValueRW;
                ref var raid      = ref stateRef.ValueRW;
                ref var hp        = ref hpRef.ValueRW;
                ref var territory = ref territoryRef.ValueRW;

                if (growth.Tier >= 2) continue;

                if (hp.Value < hp.Max)
                {
                    growth.NextEvolveTick = nowTick + growth.EvolveCadenceTicks;
                    continue;
                }

                if (nowTick < growth.NextEvolveTick) continue;

                growth.Tier++;
                ApplyTierStats(growth.Tier, ref hp, ref raid, ref territory);
                growth.NextEvolveTick = nowTick + growth.EvolveCadenceTicks;

                PublishToast(growth.Tier == 1
                    ? "Bandit camp has fortified into a Stronghold!"
                    : "Bandit Stronghold has grown into a Fortress!", ToastKind.Warning);
            }
        }

        static void ApplyTierStats(byte tier, ref BuildingHealth hp, ref BanditCampState raid, ref TerritoryEmitter territory)
        {
            switch (tier)
            {
                case 1:
                    hp.Max          = (ushort)500;
                    hp.Value        = (ushort)500;
                    raid.RaidPartySize    = (byte)8;
                    raid.RaidCadenceTicks = 35000u;
                    territory.Radius      = (byte)3;
                    break;
                case 2:
                    hp.Max          = (ushort)800;
                    hp.Value        = (ushort)800;
                    raid.RaidPartySize    = (byte)10;
                    raid.RaidCadenceTicks = 25000u;
                    territory.Radius      = (byte)4;
                    break;
            }
        }

        void PublishToast(string text, ToastKind kind)
        {
            if (_toastPub == null)
            {
                try { _toastPub = GlobalMessagePipe.GetPublisher<ToastMessage>(); }
                catch { return; }
            }
            _toastPub?.Publish(new ToastMessage(text, kind));
        }
    }
}
