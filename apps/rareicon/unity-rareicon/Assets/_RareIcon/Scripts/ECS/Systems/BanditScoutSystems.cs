using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Per-camp scout dispatch. When <see cref="BanditScoutDispatch.NextScoutTick"/> elapses and the camp has at least <see cref="ScoutLootCost"/> stockpile, spends loot to spawn one <see cref="BanditScoutTag"/> at the camp hex and re-arms cadence. Spawning during query iteration is deferred to a pending list so the structural change doesn't tear the live foreach. Main-thread SystemBase because <c>UnitSpawnSystem.SpawnBanditScoutAt</c> touches managed render assets.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(BanditCampSpawnerSystem))]
    public partial class BanditScoutDispatchSystem : SystemBase
    {
        const ushort ScoutLootCost = 5;

        uint _rng = 0xB4DC0_DECu & 0x7FFFFFFFu;

        protected override void OnCreate()
        {
            RequireForUpdate<BanditScoutDispatch>();
        }

        protected override void OnUpdate()
        {
            uint nowTick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);

            var pending = new NativeList<int2>(4, Allocator.Temp);

            foreach (var (dispatchRef, stockpileRef, building) in
                     SystemAPI.Query<RefRW<BanditScoutDispatch>,
                                     RefRW<BanditCampStockpile>,
                                     RefRO<Building>>()
                              .WithAll<BanditCampTag>())
            {
                ref var dispatch  = ref dispatchRef.ValueRW;
                ref var stockpile = ref stockpileRef.ValueRW;
                if (nowTick < dispatch.NextScoutTick) continue;
                if (stockpile.Loot < ScoutLootCost) continue;

                stockpile.Loot = (ushort)(stockpile.Loot - ScoutLootCost);
                dispatch.NextScoutTick = nowTick + dispatch.ScoutCadenceTicks;
                pending.Add(building.ValueRO.RootHex);
            }

            var em = EntityManager;
            for (int i = 0; i < pending.Length; i++)
            {
                _rng = XorShift(_rng);
                UnitSpawnSystem.SpawnBanditScoutAt(em, pending[i], _rng | 1u);
            }
            pending.Dispose();
        }

        static uint XorShift(uint s)
        {
            s ^= s << 13;
            s ^= s >> 17;
            s ^= s << 5;
            return s == 0 ? 1u : s;
        }
    }

    /// <summary>BanditScout patrol behavior. Scouts wander in long-distance random rays away from origin; when within <see cref="DetectRadius"/> of a Player building they append its hex to <see cref="KnownPlayerHexesSingleton"/> (wrap-buffer so newer sightings evict stale entries). The shared known list feeds <c>HuntJob</c>'s divert path so raid bandits across the map can converge on outposts the scout uncovered.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    public partial class BanditScoutBehaviorSystem : SystemBase
    {
        const int   DetectRadius     = 6;
        const int   PatrolStepRange  = 12;
        const float HexSize          = 0.25f;
        const byte  PatrolPriority   = (byte)(GoalPriority.Wander + 5);

        uint _rng = 0xC0_DEFA_DEu & 0x7FFFFFFFu;

        protected override void OnCreate()
        {
            EnsureSingleton();
        }

        void EnsureSingleton()
        {
            if (SystemAPI.HasSingleton<KnownPlayerHexesSingleton>()) return;
            var e = EntityManager.CreateEntity(typeof(KnownPlayerHexesSingleton), typeof(KnownPlayerHex));
            EntityManager.SetName(e, "KnownPlayerHexesSingleton");
            EntityManager.SetComponentData(e, new KnownPlayerHexesSingleton { WriteCursor = 0 });
        }

        protected override void OnUpdate()
        {
            EnsureSingleton();

            var playerHexes = new NativeList<int2>(32, Allocator.Temp);
            foreach (var building in SystemAPI.Query<RefRO<Building>>())
            {
                if (building.ValueRO.OwnerFaction != FactionType.Player) continue;
                playerHexes.Add(building.ValueRO.RootHex);
            }

            var singletonEntity = SystemAPI.GetSingletonEntity<KnownPlayerHexesSingleton>();
            ref var meta = ref SystemAPI.GetComponentRW<KnownPlayerHexesSingleton>(singletonEntity).ValueRW;
            var buffer = SystemAPI.GetBuffer<KnownPlayerHex>(singletonEntity);

            // Prune stale entries — when a Player building is destroyed
            // its hex stays cached in this buffer forever otherwise. Hunt
            // bandits then read the dead hex, distance-zero "wins" their
            // target loop, and the unit locks its goal on its own current
            // tile = idle. Walk the buffer once per tick and drop hexes
            // that no longer carry a Player building.
            for (int i = buffer.Length - 1; i >= 0; i--)
            {
                int2 hex = buffer[i].Hex;
                bool stillThere = false;
                for (int j = 0; j < playerHexes.Length; j++)
                {
                    if (playerHexes[j].Equals(hex)) { stillThere = true; break; }
                }
                if (!stillThere) buffer.RemoveAtSwapBack(i);
            }
            if (meta.WriteCursor > buffer.Length)
                meta.WriteCursor = (byte)buffer.Length;

            foreach (var (mvtRef, transformRO, goalRef) in
                     SystemAPI.Query<RefRW<UnitMovement>, RefRO<LocalTransform>, RefRW<MovementGoal>>()
                              .WithAll<BanditScoutTag>())
            {
                int2 currentHex = mvtRef.ValueRO.CurrentHex;
                if (currentHex.x == int.MinValue)
                {
                    var p = transformRO.ValueRO.Position;
                    currentHex = HexMeshUtil.WorldToHex(p.x, p.y, HexSize);
                }

                for (int i = 0; i < playerHexes.Length; i++)
                {
                    int d = AxialDistance(currentHex - playerHexes[i]);
                    if (d > DetectRadius) continue;
                    AppendKnown(buffer, ref meta, playerHexes[i]);
                }

                if (goalRef.ValueRO.Priority > PatrolPriority) continue;
                bool reached = currentHex.Equals(goalRef.ValueRO.TargetHex);
                bool noGoal  = goalRef.ValueRO.Kind == GoalKind.None;
                if (!reached && !noGoal) continue;

                _rng = XorShift(_rng);
                int dx = (int)(_rng % (uint)(PatrolStepRange * 2 + 1)) - PatrolStepRange;
                _rng = XorShift(_rng);
                int dy = (int)(_rng % (uint)(PatrolStepRange * 2 + 1)) - PatrolStepRange;
                int2 next = new int2(currentHex.x + dx, currentHex.y + dy);
                goalRef.ValueRW = new MovementGoal
                {
                    Kind      = GoalKind.MoveToHex,
                    Priority  = PatrolPriority,
                    TargetHex = next,
                };
            }

            playerHexes.Dispose();
        }

        static void AppendKnown(DynamicBuffer<KnownPlayerHex> buffer,
                                ref KnownPlayerHexesSingleton meta,
                                int2 hex)
        {
            for (int i = 0; i < buffer.Length; i++)
                if (buffer[i].Hex.Equals(hex)) return;

            const int Capacity = 32;
            if (buffer.Length < Capacity)
            {
                buffer.Add(new KnownPlayerHex { Hex = hex });
                return;
            }
            int slot = meta.WriteCursor % Capacity;
            buffer[slot] = new KnownPlayerHex { Hex = hex };
            meta.WriteCursor = (byte)((meta.WriteCursor + 1) % Capacity);
        }

        static int AxialDistance(int2 d)
        {
            int ds = -d.x - d.y;
            return (math.abs(d.x) + math.abs(d.y) + math.abs(ds)) / 2;
        }

        static uint XorShift(uint s)
        {
            s ^= s << 13;
            s ^= s >> 17;
            s ^= s << 5;
            return s == 0 ? 1u : s;
        }
    }
}
