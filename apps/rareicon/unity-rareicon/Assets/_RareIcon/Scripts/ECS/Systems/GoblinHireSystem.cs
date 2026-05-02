using MessagePipe;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Drains <see cref="GoblinHireRequest"/>s from the Goblin Cave recruit tab. Validates the Capital ledger covers <see cref="HireCoinCost"/> Coin + <see cref="HireMealCost"/> Meal, debits on success, spawns a Player Goblin at a hex adjacent to the cave, then destroys the request entity. Mirror of <see cref="ScoutRecruitSystem"/> — same defer-spawn-after-iteration pattern so structural changes don't trip the entity iterator.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial class GoblinHireSystem : SystemBase
    {
        const ushort HireCoinCost = 8;
        const ushort HireMealCost = 1;

        IPublisher<ToastMessage> _toastPub;

        protected override void OnCreate()
        {
            RequireForUpdate<GoblinHireRequest>();
        }

        protected override void OnUpdate()
        {
            var em = EntityManager;
            var pendingDestroy = new NativeList<Entity>(4, Allocator.Temp);

            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)
                || !em.HasBuffer<CapitalLedger>(capital))
            {
                foreach (var (_, reqEntity) in
                         SystemAPI.Query<RefRO<GoblinHireRequest>>().WithEntityAccess())
                    pendingDestroy.Add(reqEntity);

                for (int i = 0; i < pendingDestroy.Length; i++)
                    em.DestroyEntity(pendingDestroy[i]);
                pendingDestroy.Dispose();
                return;
            }

            var capitalBuf = em.GetBuffer<CapitalLedger>(capital).Reinterpret<BankLedgerBase>();
            var pendingSpawn = new NativeList<int2>(4, Allocator.Temp);
            var pendingSeeds = new NativeList<uint>(4, Allocator.Temp);

            foreach (var (reqRO, reqEntity) in
                     SystemAPI.Query<RefRO<GoblinHireRequest>>().WithEntityAccess())
            {
                pendingDestroy.Add(reqEntity);

                Entity cave = reqRO.ValueRO.Cave;
                if (cave == Entity.Null
                    || !em.Exists(cave)
                    || !em.HasComponent<Building>(cave)
                    || !em.HasComponent<GoblinCaveTag>(cave))
                {
                    PublishToast("Hire failed — Goblin Cave missing", ToastKind.Warning);
                    continue;
                }

                if (BankLedgerOps.CountOf(capitalBuf, (ushort)ItemId.Coin) < HireCoinCost
                    || BankLedgerOps.CountOf(capitalBuf, (ushort)ItemId.Meal) < HireMealCost)
                {
                    PublishToast("Not enough Coin + Meal to hire a Goblin", ToastKind.Warning);
                    continue;
                }

                BankLedgerOps.RemoveItem(ref capitalBuf, (ushort)ItemId.Coin, HireCoinCost);
                BankLedgerOps.RemoveItem(ref capitalBuf, (ushort)ItemId.Meal, HireMealCost);

                int2 root = em.GetComponentData<Building>(cave).RootHex;
                int dir = (int)((uint)reqEntity.Index % 6u);
                int2 spawnHex = root + HexMeshUtil.HexNeighbor(dir);

                uint seed = (uint)reqEntity.Index * 0x9E3779B1u
                          ^ (uint)(SystemAPI.Time.ElapsedTime * 1000d) * 0x85EBCA77u;
                seed |= 1u;

                pendingSpawn.Add(spawnHex);
                pendingSeeds.Add(seed);
            }

            for (int i = 0; i < pendingDestroy.Length; i++)
                em.DestroyEntity(pendingDestroy[i]);
            pendingDestroy.Dispose();

            for (int i = 0; i < pendingSpawn.Length; i++)
            {
                var goblin = UnitSpawnSystem.SpawnGoblinAt(
                    em, pendingSpawn[i], pendingSeeds[i],
                    state:    default,
                    faction:  FactionType.Player,
                    unitType: UnitType.Goblin);
                if (goblin == Entity.Null)
                    PublishToast("Hire failed — render assets missing", ToastKind.Warning);
                else
                    PublishToast("Goblin hired", ToastKind.Success);
            }
            pendingSpawn.Dispose();
            pendingSeeds.Dispose();
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
