using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Builder two-phase transport: on site hex, deliver one matching item to the ConstructionMaterial buffer (direct unit-pack/site-buffer mutation, not DB). On Capital hex when missing materials, submit Pickup reservations against Capital; PackApplySystem credits the pack.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(EmpireSharingSystem))]
    public partial struct BuilderDepositSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<LogisticsDBSingleton>();
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            if (!SystemAPI.TryGetSingleton<HexDBSingleton>(out var hexLookupSingleton)) return;

            uint tick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);

            ref var db = ref SystemAPI.GetSingletonRW<LogisticsDBSingleton>().ValueRW;
            var dep    = JobHandle.CombineDependencies(state.Dependency, db.PipelineHandle);

            var handle = new BuilderDepositJob
            {
                Capital           = capital,
                Tick              = tick,
                HexLookup         = hexLookupSingleton.Lookup,
                HexOccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(true),
                PackLookup        = SystemAPI.GetBufferLookup<PackSlot>(false),
                CapitalLookup     = SystemAPI.GetBufferLookup<CapitalLedger>(true),
                MatLookup         = SystemAPI.GetBufferLookup<ConstructionMaterial>(false),
                SiteLookup        = SystemAPI.GetComponentLookup<ConstructionSite>(true),
                SkillXpLookup     = SystemAPI.GetComponentLookup<SkillXP>(false),
                TaskLookup        = SystemAPI.GetBufferLookup<TaskMemory>(false),
                Reservations      = db.Reservations.AsParallelWriter(),
            }.Schedule(dep);

            db.PipelineHandle = handle;
            state.Dependency  = handle;
        }
    }

    [BurstCompile]
    public partial struct BuilderDepositJob : IJobEntity
    {
        const ushort XPPerDelivery = 18;

        public Entity Capital;
        public uint   Tick;

        [ReadOnly] public NativeHashMap<int2, Entity>       HexLookup;
        [ReadOnly] public ComponentLookup<HexOccupant>      HexOccupantLookup;
        [ReadOnly] public ComponentLookup<ConstructionSite> SiteLookup;
        [ReadOnly] public BufferLookup<CapitalLedger>       CapitalLookup;

        [NativeDisableParallelForRestriction] public BufferLookup<PackSlot>             PackLookup;
        [NativeDisableParallelForRestriction] public BufferLookup<ConstructionMaterial> MatLookup;
        [NativeDisableParallelForRestriction] public ComponentLookup<SkillXP>           SkillXpLookup;
        [NativeDisableParallelForRestriction] public BufferLookup<TaskMemory>           TaskLookup;

        public NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter Reservations;

        void Execute(Entity entity, in ProfessionIntent intent, in UnitMovement movement)
        {
            if (intent.Kind != ProfessionKind.Builder) return;
            if (intent.TargetEntity == Entity.Null) return;
            if (!PackLookup.HasBuffer(entity)) return;

            Entity targetSite = intent.TargetEntity;
            if (!MatLookup.HasBuffer(targetSite)) return;
            if (!SiteLookup.HasComponent(targetSite)) return;

            int2 unitHex  = movement.CurrentHex;
            var unitPack  = PackLookup[entity];
            var siteMats  = MatLookup[targetSite];

            if (IsOnHex(unitHex, SiteLookup[targetSite].RootHex))
            {
                if (TryDeliver(unitPack, siteMats))
                {
                    if (SkillXpLookup.HasComponent(entity))
                    {
                        var xp = SkillXpLookup[entity];
                        int next = xp.Get(SkillKind.Construction) + XPPerDelivery;
                        xp.Set(SkillKind.Construction, (ushort)(next > ushort.MaxValue ? ushort.MaxValue : next));
                        SkillXpLookup[entity] = xp;
                    }
                    if (AllMaterialsDelivered(siteMats) && TaskLookup.HasBuffer(entity))
                        TaskMemoryOps.MarkHead(TaskLookup[entity], TaskState.Completed);
                }
                return;
            }

            if (IsOnCapital(unitHex) && !CarriesMatchingMaterial(unitPack, siteMats))
            {
                if (!CapitalLookup.HasBuffer(Capital)) return;
                var capInv = CapitalLookup[Capital].Reinterpret<BankLedgerBase>();
                TryReservePickup(capInv, unitPack, siteMats, Capital, entity, Tick, ref Reservations);
            }
        }

        static bool IsOnHex(int2 a, int2 b) => a.x == b.x && a.y == b.y;

        bool IsOnCapital(int2 unitHex)
        {
            if (!HexLookup.TryGetValue(unitHex, out var tile)) return false;
            if (!HexOccupantLookup.HasComponent(tile)) return false;
            return HexOccupantLookup[tile].Building == Capital;
        }

        static bool AllMaterialsDelivered(DynamicBuffer<ConstructionMaterial> mats)
        {
            for (int j = 0; j < mats.Length; j++)
                if (mats[j].Delivered < mats[j].Needed) return false;
            return true;
        }

        static bool CarriesMatchingMaterial(DynamicBuffer<PackSlot> pack, DynamicBuffer<ConstructionMaterial> mats)
        {
            for (int i = 0; i < pack.Length; i++)
            {
                if (pack[i].Count == 0) continue;
                for (int j = 0; j < mats.Length; j++)
                {
                    if (mats[j].ItemId == pack[i].ItemId && mats[j].Delivered < mats[j].Needed)
                        return true;
                }
            }
            return false;
        }

        static bool TryDeliver(DynamicBuffer<PackSlot> pack, DynamicBuffer<ConstructionMaterial> mats)
        {
            for (int i = 0; i < pack.Length; i++)
            {
                if (pack[i].Count == 0) continue;
                for (int j = 0; j < mats.Length; j++)
                {
                    if (mats[j].ItemId != pack[i].ItemId) continue;
                    if (mats[j].Delivered >= mats[j].Needed) continue;

                    var slot = pack[i];
                    slot.Count -= 1;
                    pack[i] = slot;

                    var mat = mats[j];
                    mat.Delivered += 1;
                    mats[j] = mat;
                    return true;
                }
            }
            return false;
        }

        static void TryReservePickup(in DynamicBuffer<BankLedgerBase> capInv,
                                     in DynamicBuffer<PackSlot> unitPack,
                                     in DynamicBuffer<ConstructionMaterial> mats,
                                     Entity capital,
                                     Entity requester,
                                     uint tick,
                                     ref NativeParallelMultiHashMap<LedgerKey, ReservationRecord>.ParallelWriter reservations)
        {
            for (int j = 0; j < mats.Length; j++)
            {
                if (mats[j].Delivered >= mats[j].Needed) continue;

                ushort needId = mats[j].ItemId;
                int    want   = mats[j].Needed - mats[j].Delivered - CountInUnit(unitPack, needId);
                if (want <= 0) continue;

                int available = BankLedgerOps.CountOf(capInv, needId);
                if (available <= 0) continue;

                int take = math.min(available, want);
                reservations.Add(ReservationOps.Key(capital, needId), ReservationOps.Pickup(requester, take, tick));
            }
        }

        static int CountInUnit(in DynamicBuffer<PackSlot> pack, ushort itemId)
        {
            int total = 0;
            for (int i = 0; i < pack.Length; i++)
                if (pack[i].ItemId == itemId) total += pack[i].Count;
            return total;
        }
    }
}
