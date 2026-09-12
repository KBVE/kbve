using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Per-cove raid dispatch. When NowTick passes <see cref="PirateCoveState.NextRaidTick"/>, emits <see cref="PirateCoveState.RaidPartySize"/> SpawnPirateShipRequests at hexes adjacent to the cove and re-arms cadence. Sister to <see cref="BanditCampRaidSystem"/> for water raids; runs main-thread because <c>PirateShipSpawnApplierSystem</c> touches managed render assets.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    public partial class PirateCoveRaidSystem : SystemBase
    {
        uint _rng = 0xC0_5A_1B_07u;

        protected override void OnCreate()
        {
            RequireForUpdate<PirateCoveTag>();
        }

        protected override void OnUpdate()
        {
            uint nowTick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);

            var pending = new NativeList<SpawnPirateShipRequest>(8, Allocator.Temp);

            foreach (var (stateRef, building) in
                     SystemAPI.Query<RefRW<PirateCoveState>, RefRO<Building>>()
                              .WithAll<PirateCoveTag>())
            {
                ref var state = ref stateRef.ValueRW;
                if (nowTick < state.NextRaidTick) continue;

                int2 coveHex = building.ValueRO.RootHex;
                int party = state.RaidPartySize;
                for (int i = 0; i < party; i++)
                {
                    _rng = XorShift(_rng);
                    int dir = (int)(_rng % 6u);
                    int2 spawnHex = coveHex + HexMeshUtil.HexNeighbor(dir);

                    _rng = XorShift(_rng);
                    pending.Add(new SpawnPirateShipRequest
                    {
                        Hex  = spawnHex,
                        Seed = _rng | 1u,
                    });
                }

                state.NextRaidTick = nowTick + state.RaidCadenceTicks;
            }

            var em = EntityManager;
            for (int i = 0; i < pending.Length; i++)
            {
                var req = em.CreateEntity();
                em.AddComponentData(req, pending[i]);
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

    /// <summary>Main-thread drain for <see cref="SpawnPirateShipRequest"/> — mirrors <c>GalleySpawnApplierSystem</c>. Calls <see cref="UnitSpawnSystem.SpawnPirateShipAt"/> per request and destroys the carrier entity.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(PirateCoveRaidSystem))]
    public partial class PirateShipSpawnApplierSystem : SystemBase
    {
        protected override void OnCreate()
        {
            RequireForUpdate<SpawnPirateShipRequest>();
        }

        protected override void OnUpdate()
        {
            var em = EntityManager;
            var reqEntities = new NativeList<Entity>(8, Allocator.Temp);
            foreach (var (_, reqEntity) in
                     SystemAPI.Query<RefRO<SpawnPirateShipRequest>>().WithEntityAccess())
            {
                reqEntities.Add(reqEntity);
            }

            for (int i = 0; i < reqEntities.Length; i++)
            {
                var reqEntity = reqEntities[i];
                var data = em.GetComponentData<SpawnPirateShipRequest>(reqEntity);
                UnitSpawnSystem.SpawnPirateShipAt(em, data.Hex, data.Seed);
                em.DestroyEntity(reqEntity);
            }
            reqEntities.Dispose();
        }
    }
}
