using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Turn-gated drift of <see cref="CityStateDisposition"/>.Mood toward Neutral (50). Each cadence, every non-terminal city-state's Mood moves DriftPerCadence steps toward 50, and <see cref="CityStateStatus"/>.Value is recomputed against the band thresholds. Vassal / Annexed / Razed status is sticky — drift skips those entities so diplomacy decisions don't auto-revert.</summary>
    [BurstCompile]
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(EmpireSystemGroup))]
    public partial struct CityStateMoodDriftSystem : ISystem
    {
        const uint CadenceTurns = 5;

        uint _lastTurn;

        public void OnCreate(ref SystemState state)
        {
            _lastTurn = uint.MaxValue;
            state.RequireForUpdate<WorldClock>();
            state.RequireForUpdate<CityStateTag>();
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            uint turn = SystemAPI.GetSingleton<WorldClock>().TurnIndex;
            if (_lastTurn != uint.MaxValue && turn - _lastTurn < CadenceTurns) return;
            _lastTurn = turn;

            foreach (var (statusRW, dispRW, factionRW)
                     in SystemAPI.Query<RefRW<CityStateStatus>,
                                        RefRW<CityStateDisposition>,
                                        RefRW<Faction>>()
                                 .WithAll<CityStateTag>())
            {
                byte s = statusRW.ValueRO.Value;
                if (s == CityStateStatusValue.Vassal ||
                    s == CityStateStatusValue.Annexed ||
                    s == CityStateStatusValue.Razed) continue;

                ref var disp = ref dispRW.ValueRW;
                int mood = disp.Mood;
                int drift = math.max(0, (int)disp.DriftPerCadence);
                if (mood < 50) mood = math.min(50, mood + drift);
                else if (mood > 50) mood = math.max(50, mood - drift);
                disp.Mood = (byte)mood;

                byte newStatus = mood < CityStateMoodBand.HostileMax
                    ? CityStateStatusValue.Hostile
                    : mood >= CityStateMoodBand.AlliedMin
                        ? CityStateStatusValue.Allied
                        : CityStateStatusValue.Neutral;
                if (newStatus != s)
                    statusRW.ValueRW = new CityStateStatus { Value = newStatus };

                byte targetFaction = newStatus switch
                {
                    CityStateStatusValue.Hostile => FactionType.Hostile,
                    CityStateStatusValue.Allied  => FactionType.Player,
                    _                            => FactionType.Neutral,
                };
                if (factionRW.ValueRO.Value != targetFaction)
                    factionRW.ValueRW = new Faction { Value = targetFaction };
            }
        }
    }
}
