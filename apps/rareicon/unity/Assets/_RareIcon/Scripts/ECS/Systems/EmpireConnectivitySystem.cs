using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Event-driven BFS over same-faction TerritoryEmitters rooted at each Capital (Player) and each HostileTerritoryRoot (BanditCamp / GoblinCave / PirateCove / hostile GoblinVillage). Writes EmpireConnected to reachable entities, removes it from orphans via ECB; downstream TerritoryBakeSystem reads the flag to render player + hostile rings on the same shader pass.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateBefore(typeof(TerritoryBakeSystem))]
    public partial struct EmpireConnectivitySystem : ISystem
    {
        int _lastEmitterHash;

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            _lastEmitterHash = 0;
        }

        [BurstCompile]
        public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            int hash = HashEmitters(ref state);
            if (hash == _lastEmitterHash) return;
            _lastEmitterHash = hash;

            var entities = new NativeList<Entity>(16, Allocator.TempJob);
            var centers  = new NativeList<int2>  (16, Allocator.TempJob);
            var factions = new NativeList<byte>  (16, Allocator.TempJob);
            var caps     = new NativeList<int>   ( 2, Allocator.TempJob);

            int idx = 0;
            foreach (var (emitterRO, entity) in
                     SystemAPI.Query<RefRO<TerritoryEmitter>>().WithEntityAccess())
            {
                var e = emitterRO.ValueRO;
                if (e.Radius == 0) continue;
                entities.Add(entity);
                centers .Add(e.Center);
                factions.Add(e.OwnerFaction);
                if (SystemAPI.HasComponent<CapitalTag>(entity)
                    || SystemAPI.HasComponent<HostileTerritoryRoot>(entity))
                    caps.Add(idx);
                idx++;
            }

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            state.Dependency = new ConnectivityBfsJob
            {
                Entities = entities.AsDeferredJobArray(),
                Centers  = centers .AsDeferredJobArray(),
                Factions = factions.AsDeferredJobArray(),
                Capitals = caps    .AsDeferredJobArray(),
                Radius   = BuildingDB.OutpostAnchorRadius,
                Ecb      = ecb,
            }.Schedule(state.Dependency);

            state.Dependency = entities.Dispose(state.Dependency);
            state.Dependency = centers .Dispose(state.Dependency);
            state.Dependency = factions.Dispose(state.Dependency);
            state.Dependency = caps    .Dispose(state.Dependency);
        }

        [BurstCompile]
        int HashEmitters(ref SystemState state)
        {
            int h = 17;
            foreach (var e in SystemAPI.Query<RefRO<TerritoryEmitter>>())
            {
                h = h * 31 + e.ValueRO.Center.x;
                h = h * 31 + e.ValueRO.Center.y;
                h = h * 31 + e.ValueRO.Radius;
                h = h * 31 + e.ValueRO.OwnerFaction;
            }
            return h;
        }
    }

    [BurstCompile]
    struct ConnectivityBfsJob : IJob
    {
        [ReadOnly] public NativeArray<Entity> Entities;
        [ReadOnly] public NativeArray<int2>   Centers;
        [ReadOnly] public NativeArray<byte>   Factions;
        [ReadOnly] public NativeArray<int>    Capitals;
        public int Radius;
        public EntityCommandBuffer Ecb;

        public void Execute()
        {
            int n = Entities.Length;
            if (n == 0) return;

            var visited  = new NativeBitArray(n, Allocator.Temp, NativeArrayOptions.ClearMemory);
            var frontier = new NativeQueue<int>(Allocator.Temp);

            for (int k = 0; k < Capitals.Length; k++)
            {
                int root = Capitals[k];
                if (visited.IsSet(root)) continue;
                visited.Set(root, true);
                frontier.Enqueue(root);

                while (frontier.TryDequeue(out int current))
                {
                    byte fac = Factions[current];
                    int2 pos = Centers[current];
                    for (int i = 0; i < n; i++)
                    {
                        if (visited.IsSet(i)) continue;
                        if (Factions[i] != fac) continue;
                        if (AxialDistance(Centers[i] - pos) > Radius) continue;
                        visited.Set(i, true);
                        frontier.Enqueue(i);
                    }
                }
            }

            for (int j = 0; j < n; j++)
            {
                if (visited.IsSet(j)) Ecb.AddComponent   <EmpireConnected>(Entities[j]);
                else                  Ecb.RemoveComponent<EmpireConnected>(Entities[j]);
            }

            visited .Dispose();
            frontier.Dispose();
        }

        static int AxialDistance(int2 d)
        {
            int ds = -d.x - d.y;
            return (math.abs(d.x) + math.abs(d.y) + math.abs(ds)) / 2;
        }
    }
}
