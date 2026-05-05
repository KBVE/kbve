using System;
using RareIcon.Native;
using Unity.Burst;
using Unity.Collections;
using Unity.Collections.LowLevel.Unsafe;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Singleton state for the uniti flow-field heal dispatcher. Holds the long-lived <c>uniti_grid_*</c> handle (painted Solid for the entire 192x192 catchment around origin), the most-recent <c>uniti_flow_compute</c> handle (rebuilt only on healer-set hash change), and the cached healer count + last-rebuild hash. Consumers read <see cref="FieldHandle"/> and call <c>uniti_flow_distance</c> from inside Burst jobs for O(1) distance queries; the companion <see cref="HealerHexElement"/> dynamic buffer carries the same hex list as a Burst-readable goal source for downstream pickers.</summary>
    public struct HealFlowFieldSingleton : IComponentData
    {
        public IntPtr GridHandle;
        public IntPtr FieldHandle;
        public int    OriginX;
        public int    OriginZ;
        public int    Size;
        public int    HealerCount;
        public ulong  LastHash;
    }

    /// <summary>One healer root hex. Written by <see cref="HealFlowFieldService"/>, read by <see cref="UnitBehaviorSystem"/>. Reinterpretable as <c>NativeArray&lt;int2&gt;</c> via <see cref="DynamicBuffer{T}.Reinterpret{U}"/> since the struct is just <c>int2</c>.</summary>
    [InternalBufferCapacity(8)]
    public struct HealerHexElement : IBufferElementData
    {
        public int2 Hex;
    }

    /// <summary>ISystem owner of the uniti flow-field for healing dispatch. OnCreate allocates the 192x192 grid + schedules a Burst <see cref="FillGridJob"/> that paints every cell Solid off the main thread. OnUpdate is fully deferred — it kicks <see cref="EntityQuery.ToComponentDataListAsync{T}"/> to snapshot the <see cref="ProvidesHealing"/> Building array on a worker, then chains <see cref="SnapshotHashComputeJob"/> which hashes the root-hex set, refills the <see cref="HealerHexElement"/> buffer on diff, calls <c>uniti_flow_free</c> + <c>uniti_flow_compute</c>, and writes the new handle back into the singleton via <see cref="ComponentLookup{T}"/>. Main-thread cost per frame is the schedule call + dependency wiring — every byte of work lives on a worker.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateBefore(typeof(UnitBehaviorSystem))]
    public partial struct HealFlowFieldService : ISystem
    {
        const int GridSize    = 192;
        const int GridOriginX = -GridSize / 2;
        const int GridOriginZ = -GridSize / 2;

        Entity      _singleton;
        EntityQuery _healersQuery;

        public unsafe void OnCreate(ref SystemState state)
        {
            _healersQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<ProvidesHealing, Building>()
                .Build(ref state);

            _singleton = state.EntityManager.CreateEntity(
                typeof(HealFlowFieldSingleton),
                typeof(HealerHexElement));
            state.EntityManager.SetName(_singleton, "HealFlowFieldSingleton");

            void* gridHandle = Uniti.uniti_grid_new(
                GridOriginX, GridOriginZ, (uint)GridSize, (uint)GridSize);

            state.EntityManager.SetComponentData(_singleton, new HealFlowFieldSingleton
            {
                GridHandle  = (IntPtr)gridHandle,
                FieldHandle = IntPtr.Zero,
                OriginX     = GridOriginX,
                OriginZ     = GridOriginZ,
                Size        = GridSize,
                HealerCount = 0,
                LastHash    = 0,
            });

            state.Dependency = new FillGridJob
            {
                GridHandle = (IntPtr)gridHandle,
                OriginX    = GridOriginX,
                OriginZ    = GridOriginZ,
                Size       = GridSize,
            }.Schedule(state.Dependency);

            state.RequireForUpdate<HealFlowFieldSingleton>();
        }

        [BurstCompile]
        public unsafe void OnDestroy(ref SystemState state)
        {
            state.Dependency.Complete();
            if (!state.EntityManager.Exists(_singleton)) return;

            var data = state.EntityManager.GetComponentData<HealFlowFieldSingleton>(_singleton);
            if (data.FieldHandle != IntPtr.Zero) Uniti.uniti_flow_free((void*)data.FieldHandle);
            if (data.GridHandle  != IntPtr.Zero) Uniti.uniti_grid_free((void*)data.GridHandle);
        }

        public void OnUpdate(ref SystemState state)
        {
            var buildings = _healersQuery.ToComponentDataListAsync<Building>(
                Allocator.TempJob, state.Dependency, out var snapshotJh);

            var jh = new SnapshotHashComputeJob
            {
                Buildings       = buildings,
                Singleton       = _singleton,
                SingletonLookup = SystemAPI.GetComponentLookup<HealFlowFieldSingleton>(false),
                HexBufferLookup = SystemAPI.GetBufferLookup<HealerHexElement>(false),
            }.Schedule(snapshotJh);

            state.Dependency = buildings.Dispose(jh);
        }
    }

    [BurstCompile]
    public unsafe struct FillGridJob : IJob
    {
        [NativeDisableUnsafePtrRestriction] public IntPtr GridHandle;
        public int    OriginX;
        public int    OriginZ;
        public int    Size;

        public void Execute()
        {
            void* h = (void*)GridHandle;
            for (int z = 0; z < Size; z++)
            {
                int gz = OriginZ + z;
                for (int x = 0; x < Size; x++)
                {
                    Uniti.uniti_grid_set(h, OriginX + x, gz, 0, 1);
                }
            }
        }
    }

    /// <summary>End-to-end off-main pipeline tail. Reads the snapshotted Building array, hashes the root-hex set, early-outs when the hash matches the singleton's <c>LastHash</c>, otherwise refills the <see cref="HealerHexElement"/> buffer, frees the prior field via <c>uniti_flow_free</c>, computes a fresh field via <c>uniti_flow_compute</c>, and writes the new handle + hash + count back into the singleton. Goals flatten to a stack-allocated <c>int*</c> sized for up to 256 healers, so no temp allocation hits the heap on the worker.</summary>
    [BurstCompile]
    public unsafe struct SnapshotHashComputeJob : IJob
    {
        const int MaxHealers = 256;
        const ulong FnvOffset = 1469598103934665603UL;
        const ulong FnvPrime  = 1099511628211UL;

        [ReadOnly] public NativeList<Building> Buildings;
        public Entity Singleton;
        public ComponentLookup<HealFlowFieldSingleton> SingletonLookup;
        public BufferLookup<HealerHexElement>          HexBufferLookup;

        public void Execute()
        {
            int n = Buildings.Length;
            if (n > MaxHealers) n = MaxHealers;

            ulong hash = FnvOffset;
            for (int i = 0; i < n; i++)
            {
                var hex = Buildings[i].RootHex;
                hash ^= (ulong)(uint)hex.x; hash *= FnvPrime;
                hash ^= (ulong)(uint)hex.y; hash *= FnvPrime;
            }

            var data = SingletonLookup[Singleton];
            if (hash == data.LastHash) return;

            var hexBuf = HexBufferLookup[Singleton];
            hexBuf.Clear();
            for (int i = 0; i < n; i++)
                hexBuf.Add(new HealerHexElement { Hex = Buildings[i].RootHex });

            if (data.FieldHandle != IntPtr.Zero)
                Uniti.uniti_flow_free((void*)data.FieldHandle);

            IntPtr newField = IntPtr.Zero;
            if (n > 0)
            {
                int* goals = stackalloc int[MaxHealers * 2];
                for (int i = 0; i < n; i++)
                {
                    goals[i * 2 + 0] = Buildings[i].RootHex.x;
                    goals[i * 2 + 1] = Buildings[i].RootHex.y;
                }
                void* fh = Uniti.uniti_flow_compute((void*)data.GridHandle, goals, (uint)n);
                newField = (IntPtr)fh;
            }

            data.FieldHandle = newField;
            data.LastHash    = hash;
            data.HealerCount = n;
            SingletonLookup[Singleton] = data;
        }
    }
}
