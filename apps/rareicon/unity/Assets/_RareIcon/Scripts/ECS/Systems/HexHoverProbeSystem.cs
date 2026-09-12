using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Schedules a Burst worker-thread job that fills <see cref="InputSnapshotSingleton"/>: the latest <see cref="HoverSnapshot"/> + any new <see cref="ClickSnapshot"/> entries. Probe acquires component lookups on main thread, materialises the unit entity list, then scheduling moves the heavy data fetch + sort onto a worker. Main thread does ~µs of bookkeeping per frame.</summary>
    [BurstCompile]
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial struct HexHoverProbeSystem : ISystem
    {
        EntityQuery _unitQuery;

        public void OnCreate(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<InputSnapshotSingleton>())
            {
                var s = new InputSnapshotSingleton
                {
                    Hover  = new NativeReference<HoverSnapshot>(Allocator.Persistent),
                    Clicks = new NativeQueue<ClickSnapshot>(Allocator.Persistent),
                };
                var e = state.EntityManager.CreateEntity(typeof(InputSnapshotSingleton));
                state.EntityManager.SetComponentData(e, s);
                state.EntityManager.SetName(e, "InputSnapshotSingleton");
            }

            _unitQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<Unit, LocalTransform>()
                .Build(ref state);

            state.RequireForUpdate<MouseState>();
            state.RequireForUpdate<HexDBSingleton>();
            state.RequireForUpdate<InputSnapshotSingleton>();
        }

        public void OnDestroy(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<InputSnapshotSingleton>()) return;
            var s = SystemAPI.GetSingleton<InputSnapshotSingleton>();
            if (s.Hover.IsCreated)  s.Hover.Dispose();
            if (s.Clicks.IsCreated) s.Clicks.Dispose();
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var mouse = SystemAPI.GetSingleton<MouseState>();
            var db    = SystemAPI.GetSingleton<HexDBSingleton>();
            var inputRW = SystemAPI.GetSingletonRW<InputSnapshotSingleton>();
            ref var input = ref inputRW.ValueRW;
            if (!db.Lookup.IsCreated) return;

            bool clickThisFrame = mouse.LeftReleasedThisFrame && !mouse.OverUI && !mouse.DragEndedThisFrame;
            bool hexChanged     = mouse.Changed && !mouse.HexCoord.Equals(input.Hover.Value.HexCoord);
            if (!hexChanged && !clickThisFrame) return;

            var unitEntities = _unitQuery.ToEntityListAsync(state.WorldUpdateAllocator,
                                                            state.Dependency,
                                                            out var queryHandle);

            var deps = JobHandle.CombineDependencies(state.Dependency, queryHandle, db.DrainHandle);
            deps = JobHandle.CombineDependencies(deps, input.ProbeHandle);

            state.Dependency = new HexHoverProbeJob
            {
                Mouse           = mouse,
                Lookup          = db.Lookup,
                Snapshot        = input.Hover,
                Clicks          = input.Clicks,
                ClickThisFrame  = clickThisFrame,
                HexChanged      = hexChanged,
                UnitEntities    = unitEntities,
                TransformLookup = SystemAPI.GetComponentLookup<LocalTransform>(true),
                UnitLookup      = SystemAPI.GetComponentLookup<Unit>(true),
                BiomeLookup     = SystemAPI.GetComponentLookup<BiomeType>(true),
                ResourceLookup  = SystemAPI.GetComponentLookup<HexResources>(true),
                FactionLookup   = SystemAPI.GetComponentLookup<Faction>(true),
                NameLookup      = SystemAPI.GetComponentLookup<UnitName>(true),
                HealthLookup    = SystemAPI.GetComponentLookup<Health>(true),
                EnergyLookup    = SystemAPI.GetComponentLookup<Energy>(true),
                ManaLookup      = SystemAPI.GetComponentLookup<Mana>(true),
                HungerLookup    = SystemAPI.GetComponentLookup<Hunger>(true),
                FatigueLookup   = SystemAPI.GetComponentLookup<Fatigue>(true),
                PackLookup      = SystemAPI.GetBufferLookup<PackSlot>(true),
            }.Schedule(deps);

            input.ProbeHandle = state.Dependency;
        }
    }

    [BurstCompile]
    struct HexHoverProbeJob : IJob
    {
        const float HexSize = 0.25f;

        public MouseState Mouse;
        [ReadOnly] public NativeHashMap<int2, Entity> Lookup;
        public NativeReference<HoverSnapshot> Snapshot;
        public NativeQueue<ClickSnapshot> Clicks;
        public bool ClickThisFrame;
        public bool HexChanged;
        [ReadOnly] public NativeList<Entity> UnitEntities;
        [ReadOnly] public ComponentLookup<LocalTransform> TransformLookup;
        [ReadOnly] public ComponentLookup<Unit>           UnitLookup;
        [ReadOnly] public ComponentLookup<BiomeType>      BiomeLookup;
        [ReadOnly] public ComponentLookup<HexResources>   ResourceLookup;
        [ReadOnly] public ComponentLookup<Faction>        FactionLookup;
        [ReadOnly] public ComponentLookup<UnitName>       NameLookup;
        [ReadOnly] public ComponentLookup<Health>         HealthLookup;
        [ReadOnly] public ComponentLookup<Energy>         EnergyLookup;
        [ReadOnly] public ComponentLookup<Mana>           ManaLookup;
        [ReadOnly] public ComponentLookup<Hunger>         HungerLookup;
        [ReadOnly] public ComponentLookup<Fatigue>        FatigueLookup;
        [ReadOnly] public BufferLookup<PackSlot>          PackLookup;

        public void Execute()
        {
            bool isLand = Lookup.TryGetValue(Mouse.HexCoord, out Entity hexEntity);

            byte biomeId = 0;
            byte wood = 0, stone = 0, berries = 0, mushrooms = 0, herbs = 0, cactus = 0, cactusVariant = 0;
            if (isLand)
            {
                if (BiomeLookup.HasComponent(hexEntity)) biomeId = BiomeLookup[hexEntity].Value;
                if (ResourceLookup.HasComponent(hexEntity))
                {
                    var res = ResourceLookup[hexEntity];
                    wood = res.Wood; stone = res.Stone; berries = res.Berries;
                    mushrooms = res.Mushrooms; herbs = res.Herbs;
                    cactus = res.Cactus; cactusVariant = res.CactusVariant;
                }
            }

            byte unitType = 0, unitFaction = 0;
            ushort nameFirst = 0, nameEpithet = 0;
            float hp = 0, hpMax = 0, en = 0, enMax = 0, mp = 0, mpMax = 0;
            float hg = 0, hgMax = 0, fg = 0, fgMax = 0;
            ushort i0 = 0, c0 = 0, i1 = 0, c1 = 0, i2 = 0, c2 = 0, i3 = 0, c3 = 0;

            for (int u = 0; u < UnitEntities.Length; u++)
            {
                var entity = UnitEntities[u];
                if (!TransformLookup.HasComponent(entity)) continue;
                var p = TransformLookup[entity].Position;
                var unitHex = HexMeshUtil.WorldToHex(p.x, p.y, HexSize);
                if (!unitHex.Equals(Mouse.HexCoord)) continue;

                if (UnitLookup.HasComponent(entity)) unitType = UnitLookup[entity].Type;
                if (FactionLookup.HasComponent(entity)) unitFaction = FactionLookup[entity].Value;
                if (NameLookup.HasComponent(entity))
                {
                    var nm = NameLookup[entity];
                    nameFirst = nm.FirstNameId;
                    nameEpithet = nm.EpithetId;
                }
                if (HealthLookup.HasComponent(entity))   { var h = HealthLookup[entity];  hp = h.Value;  hpMax = h.Max; }
                if (EnergyLookup.HasComponent(entity))   { var e = EnergyLookup[entity];  en = e.Value;  enMax = e.Max; }
                if (ManaLookup.HasComponent(entity))     { var m = ManaLookup[entity];    mp = m.Value;  mpMax = m.Max; }
                if (HungerLookup.HasComponent(entity))   { var hu = HungerLookup[entity]; hg = hu.Value; hgMax = hu.Max; }
                if (FatigueLookup.HasComponent(entity))  { var f = FatigueLookup[entity]; fg = f.Value;  fgMax = f.Max; }

                if (PackLookup.HasBuffer(entity))
                {
                    var inv = PackLookup[entity];
                    const int MaxAgg = 32;
                    var aggIds    = new NativeArray<ushort>(MaxAgg, Allocator.Temp);
                    var aggCounts = new NativeArray<int>(MaxAgg, Allocator.Temp);
                    int uniq = 0;
                    for (int k = 0; k < inv.Length; k++)
                    {
                        ushort id  = inv[k].ItemId;
                        ushort cnt = inv[k].Count;
                        if (id == 0 || cnt == 0) continue;
                        int hit = -1;
                        for (int j = 0; j < uniq; j++)
                            if (aggIds[j] == id) { hit = j; break; }
                        if (hit >= 0) aggCounts[hit] = aggCounts[hit] + cnt;
                        else if (uniq < MaxAgg)
                        { aggIds[uniq] = id; aggCounts[uniq] = cnt; uniq++; }
                    }
                    for (int a = 1; a < uniq; a++)
                    {
                        int kc = aggCounts[a]; ushort ki = aggIds[a];
                        int b = a - 1;
                        while (b >= 0 && aggCounts[b] < kc)
                        {
                            aggCounts[b + 1] = aggCounts[b];
                            aggIds[b + 1]    = aggIds[b];
                            b--;
                        }
                        aggCounts[b + 1] = kc;
                        aggIds[b + 1]    = ki;
                    }
                    if (uniq > 0) { i0 = aggIds[0]; c0 = (ushort)math.min(aggCounts[0], ushort.MaxValue); }
                    if (uniq > 1) { i1 = aggIds[1]; c1 = (ushort)math.min(aggCounts[1], ushort.MaxValue); }
                    if (uniq > 2) { i2 = aggIds[2]; c2 = (ushort)math.min(aggCounts[2], ushort.MaxValue); }
                    if (uniq > 3) { i3 = aggIds[3]; c3 = (ushort)math.min(aggCounts[3], ushort.MaxValue); }
                    aggIds.Dispose();
                    aggCounts.Dispose();
                }
                break;
            }

            int prevGen = Snapshot.Value.Generation;
            int newGen  = HexChanged ? prevGen + 1 : prevGen;
            Snapshot.Value = new HoverSnapshot
            {
                Generation     = newGen,
                HexCoord       = Mouse.HexCoord,
                BiomeId        = biomeId,
                IsLand         = (byte)(isLand ? 1 : 0),
                Wood           = wood,
                Stone          = stone,
                Berries        = berries,
                Mushrooms      = mushrooms,
                Herbs          = herbs,
                Cactus         = cactus,
                CactusVariant  = cactusVariant,
                UnitType       = unitType,
                UnitFaction    = unitFaction,
                UnitNameFirst  = nameFirst,
                UnitNameEpithet= nameEpithet,
                HpValue = hp, HpMax = hpMax,
                EnValue = en, EnMax = enMax,
                MpValue = mp, MpMax = mpMax,
                HgValue = hg, HgMax = hgMax,
                FgValue = fg, FgMax = fgMax,
                I0 = i0, C0 = c0,
                I1 = i1, C1 = c1,
                I2 = i2, C2 = c2,
                I3 = i3, C3 = c3,
            };

            if (ClickThisFrame)
            {
                Clicks.Enqueue(new ClickSnapshot
                {
                    HexCoord = Mouse.HexCoord,
                    BiomeId  = biomeId,
                    IsLand   = (byte)(isLand ? 1 : 0),
                });
            }
        }
    }
}
