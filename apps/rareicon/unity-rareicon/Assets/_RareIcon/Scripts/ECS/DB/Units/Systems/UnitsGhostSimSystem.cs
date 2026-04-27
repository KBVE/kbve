using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ServerSimulation)]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [BurstCompile]
    public partial struct UnitsGhostSimSystem : ISystem
    {
        const float TickIntervalSecs = 1.0f;
        float _accum;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<UnitsDBSingleton>();
            state.RequireForUpdate<WorldClock>();
        }

        public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            _accum += SystemAPI.Time.DeltaTime;
            if (_accum < TickIntervalSecs) return;
            _accum = 0f;

            float now = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;
            ref var db = ref SystemAPI.GetSingletonRW<UnitsDBSingleton>().ValueRW;
            if (!db.Unloaded.IsCreated || db.Unloaded.Length == 0) return;

            state.Dependency = new GhostSimJob
            {
                NowSecs  = now,
                Unloaded = db.Unloaded.AsArray(),
            }.Schedule(db.Unloaded.Length, 64, state.Dependency);
        }
    }

    [BurstCompile]
    struct GhostSimJob : IJobParallelFor
    {
        public float NowSecs;
        public NativeArray<UnloadedUnitRecord> Unloaded;

        public void Execute(int i)
        {
            var rec = Unloaded[i];
            float dt = NowSecs - rec.LastTickSecs;
            if (dt <= 0f) return;

            rec.Hunger  = Clamp(rec.Hunger  + (int)(rec.HungerPerSec  * dt), 0, rec.HungerMax);
            rec.Fatigue = Clamp(rec.Fatigue + (int)(rec.FatiguePerSec * dt), 0, rec.FatigueMax);
            rec.Energy  = Clamp(rec.Energy  + (int)(rec.EnergyPerSec  * dt), 0, rec.EnergyMax);

            float hungerFrac = rec.HungerMax > 0 ? (float)rec.Hunger / rec.HungerMax : 0f;
            if (hungerFrac > 0.95f && rec.Health > 0)
            {
                int starvation = (int)math.max(1f, dt * 0.25f);
                rec.Health = (ushort)math.max(0, rec.Health - starvation);
            }

            rec.LastTickSecs = NowSecs;
            Unloaded[i] = rec;
        }

        static ushort Clamp(int value, int lo, ushort hi)
        {
            if (value < lo) return (ushort)lo;
            if (value > hi) return hi;
            return (ushort)value;
        }
    }
}
