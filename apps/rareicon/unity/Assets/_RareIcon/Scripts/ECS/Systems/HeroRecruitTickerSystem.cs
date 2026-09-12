using MessagePipe;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Drains <see cref="HeroRecruitTicker"/>s on Guildhall (Barracks T1 variant 2) buildings — when <see cref="HeroRecruitTicker.NextRecruitTick"/> elapses, spawns a free hero (rotating role) on a hex adjacent to the building and re-arms cadence. Roles cycle MasterBlacksmith → MasterCraftsman so the player gets one of each before repeats. Main-thread SystemBase because <c>UnitSpawnSystem.SpawnHeroAt</c> touches managed render assets.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    public partial class HeroRecruitTickerSystem : SystemBase
    {
        IPublisher<ToastMessage> _toastPub;
        uint _rng = 0xCAFE_F00Du;
        byte _roleCursor;

        protected override void OnCreate()
        {
            RequireForUpdate<HeroRecruitTicker>();
        }

        protected override void OnUpdate()
        {
            uint nowTick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);

            var pending = new NativeList<PendingRecruit>(2, Allocator.Temp);
            foreach (var (tickerRef, building) in
                     SystemAPI.Query<RefRW<HeroRecruitTicker>, RefRO<Building>>())
            {
                ref var ticker = ref tickerRef.ValueRW;
                if (ticker.CadenceTicks == 0u) continue;
                if (nowTick < ticker.NextRecruitTick) continue;
                ticker.NextRecruitTick = nowTick + ticker.CadenceTicks;
                if (building.ValueRO.OwnerFaction != FactionType.Player) continue;
                pending.Add(new PendingRecruit { Hex = building.ValueRO.RootHex });
            }

            var em = EntityManager;
            for (int i = 0; i < pending.Length; i++)
            {
                _rng = XorShift(_rng);
                int dir = (int)(_rng % 6u);
                int2 spawnHex = pending[i].Hex + HexMeshUtil.HexNeighbor(dir);

                _rng = XorShift(_rng);
                byte role = (_roleCursor & 1) == 0
                    ? HeroRole.MasterBlacksmith
                    : HeroRole.MasterCraftsman;
                _roleCursor++;

                var hero = UnitSpawnSystem.SpawnHeroAt(em, spawnHex, _rng | 1u, role);
                if (hero == Entity.Null) continue;

                PublishToast(role == HeroRole.MasterBlacksmith
                    ? "Guildhall recruited a Master Blacksmith"
                    : "Guildhall recruited a Master Craftsman", ToastKind.Success);
            }
            pending.Dispose();
        }

        struct PendingRecruit
        {
            public int2 Hex;
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

        static uint XorShift(uint s)
        {
            s ^= s << 13;
            s ^= s >> 17;
            s ^= s << 5;
            return s == 0 ? 1u : s;
        }
    }
}
