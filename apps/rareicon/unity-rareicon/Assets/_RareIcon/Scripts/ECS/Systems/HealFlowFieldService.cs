using System;
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

    /// <summary>ISystem owner of the uniti flow-field for healing dispatch. OnCreate allocates the 192x192 grid + schedules a Burst <see cref="FillGridJob"/> that paints every cell Solid off the main thread. OnUpdate hashes the live <see cref="ProvidesHealing"/> root-hex set in Burst; on diff it schedules <see cref="ComputeFlowJob"/> which calls <c>uniti_flow_compute</c> on a worker, frees the prior field, and writes the fresh handle back into the singleton via <see cref="ComponentLookup{T}"/>. Net main-thread cost per frame is the hash compare + buffer refill — the BFS itself never touches the main thread.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateBefore(typeof(UnitBehaviorSystem))]
    public partial struct HealFlowFieldService : ISystem
    {
        const int GridSize    = 192;
        const int GridOriginX = -GridSize / 2;
        const int GridOriginZ = -GridSize / 2;

        Entity _singleton;

        public unsafe void OnCreate(ref SystemState state)
        {
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

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var singletonRW = SystemAPI.GetComponentRW<HealFlowFieldSingleton>(_singleton);
            var hexBuffer   = SystemAPI.GetBuffer<HealerHexElement>(_singleton);

            var hexes = new NativeList<int2>(8, Allocator.Temp);
            ulong hash = 1469598103934665603UL;
            foreach (var building in SystemAPI.Query<RefRO<Building>>().WithAll<ProvidesHealing>())
            {
                var hex = building.ValueRO.RootHex;
                hexes.Add(hex);
                hash ^= (ulong)(uint)hex.x; hash *= 1099511628211UL;
                hash ^= (ulong)(uint)hex.y; hash *= 1099511628211UL;
            }

            ref var s = ref singletonRW.ValueRW;
            if (hash == s.LastHash)
            {
                hexes.Dispose();
                return;
            }

            hexBuffer.Clear();
            for (int i = 0; i < hexes.Length; i++)
                hexBuffer.Add(new HealerHexElement { Hex = hexes[i] });

            int n = hexes.Length;
            var goals = new NativeArray<int>(n * 2, Allocator.TempJob);
            for (int i = 0; i < n; i++)
            {
                goals[i * 2 + 0] = hexes[i].x;
                goals[i * 2 + 1] = hexes[i].y;
            }
            hexes.Dispose();

            IntPtr oldField = s.FieldHandle;
            s.LastHash    = hash;
            s.HealerCount = n;
            s.FieldHandle = IntPtr.Zero;

            var lookup = SystemAPI.GetComponentLookup<HealFlowFieldSingleton>(false);
            var jh = new ComputeFlowJob
            {
                GridHandle = s.GridHandle,
                OldField   = oldField,
                Goals      = goals,
                Singleton  = _singleton,
                Lookup     = lookup,
            }.Schedule(state.Dependency);

            state.Dependency = goals.Dispose(jh);
        }
    }

    [BurstCompile]
    public unsafe struct FillGridJob : IJob
    {
        public IntPtr GridHandle;
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

    [BurstCompile]
    public unsafe struct ComputeFlowJob : IJob
    {
        public IntPtr GridHandle;
        public IntPtr OldField;
        [ReadOnly] public NativeArray<int> Goals;
        public Entity Singleton;
        public ComponentLookup<HealFlowFieldSingleton> Lookup;

        public void Execute()
        {
            if (OldField != IntPtr.Zero)
                Uniti.uniti_flow_free((void*)OldField);

            IntPtr newField = IntPtr.Zero;
            if (Goals.Length >= 2)
            {
                int* ptr = (int*)Goals.GetUnsafeReadOnlyPtr();
                uint count = (uint)(Goals.Length / 2);
                void* fh = Uniti.uniti_flow_compute((void*)GridHandle, ptr, count);
                newField = (IntPtr)fh;
            }

            var data = Lookup[Singleton];
            data.FieldHandle = newField;
            Lookup[Singleton] = data;
        }
    }
}
