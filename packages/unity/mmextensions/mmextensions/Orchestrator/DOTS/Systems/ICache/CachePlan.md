# Entity Cache System Plan

let’s lock down a lean, Burst-friendly Cache System that focuses purely on the DOTS side (IJob/ISystem), no UI. It’ll:

Gather blittable “blit” snapshots in parallel jobs

Merge them into a per-frame cache buffer (entity singleton)

Drain on Presentation for safe handoff to your bridge (no UI here yet)

Zero GC, cache-friendly, change-filtered, easy to duplicate per “shard” (Agents, Items, Structures)

Below is a minimal-but-fast pattern for one shard (AgentBlit). Copy/paste to make StructureBlit, ItemBlit, etc.

## 0 Blit & marker (unmanaged only)

Proof of Cocnept for the Blit & Marker 

```c#

using Unity.Entities;
using Unity.Mathematics;

// Keep strictly unmanaged fields
public struct AgentBlit : IBufferElementData
{
    public int    Id;
    public float3 WorldPos;
    public float  Health01;
    public byte   Flags;    // bits: selected/hovered/etc
    public uint   Version;  // bump when data changes
}

// Optional: “source” gameplay comps that you already have
public struct Agent : IComponentData { public int Id; }
public struct Health01 : IComponentData { public float Value; }

```

## 1 Per-frame cache entity (singleton buffer)

```c#
public struct AgentFrameCacheTag : IComponentData {} // marks the singleton
public struct AgentFrameCache : IBufferElementData { public AgentBlit Value; }

// Bootstrap once (e.g., via a Baker or a CreateSystem)
[DisableAutoCreation]
public partial class AgentCacheBootstrap : SystemBase
{
    protected override void OnCreate()
    {
        var e = EntityManager.CreateEntity();
        EntityManager.AddComponent<AgentFrameCacheTag>(e);
        var buf = EntityManager.AddBuffer<AgentFrameCache>(e);
        buf.EnsureCapacity(4096);
        Enabled = false; // run once
    }
    protected override void OnUpdate() {}
}
```

We use a DynamicBuffer on a singleton to pass data across systems safely & Burst-ably.

## 2 Producer Simulation - Parallel Builds of Deltas

- Uses ChangeFilter to only write changed agents.
- Writes to a NativeStream in parallel (super cheap, no locking).

```c#

using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Transforms;

[BurstCompile]
[UpdateInGroup(typeof(SimulationSystemGroup))]
public partial struct AgentBlitProduceSystem : ISystem
{
    private EntityQuery _q; // source archetype
    private ComponentTypeSet _required;

    public void OnCreate(ref SystemState s)
    {
        _required = new ComponentTypeSet(
            ComponentType.ReadOnly<Agent>(),
            ComponentType.ReadOnly<LocalToWorld>(),
            ComponentType.ReadOnly<Health01>()
        );

        _q = s.GetEntityQuery(_required);
        // Only wake when something changed
        _q.SetChangedVersionFilter(typeof(LocalToWorld));
        _q.AddChangedVersionFilter(typeof(Health01));
    }

    public void OnUpdate(ref SystemState s)
    {
        if (_q.IsEmptyIgnoreFilter) return;

        var chunks = _q.ToArchetypeChunkArray(Allocator.TempJob, out var jobHandle);
        s.Dependency = JobHandle.CombineDependencies(s.Dependency, jobHandle);

        var agentType   = s.GetComponentTypeHandle<Agent>(true);
        var l2wType     = s.GetComponentTypeHandle<LocalToWorld>(true);
        var healthType  = s.GetComponentTypeHandle<Health01>(true);

        // Parallel gather
        var stream = new NativeStream(chunks.Length, s.WorldUpdateAllocator);
        var gatherJob = new GatherJob
        {
            Chunks     = chunks,
            AgentType  = agentType,
            L2WType    = l2wType,
            HealthType = healthType,
            OutStream  = stream.AsWriter()
        };
        s.Dependency = gatherJob.Schedule(chunks.Length, 1, s.Dependency);

        // Merge once into the singleton buffer (main thread safe)
        var cacheEntity = SystemAPI.GetSingletonEntity<AgentFrameCacheTag>();

        var mergeJob = new MergeJob
        {
            InStream = stream.AsReader(),
            CacheE   = cacheEntity
        };
        s.Dependency = mergeJob.Schedule(s.Dependency);
    }

    [BurstCompile]
    private struct GatherJob : IJobFor
    {
        [ReadOnly] public NativeArray<ArchetypeChunk> Chunks;
        [ReadOnly] public ComponentTypeHandle<Agent> AgentType;
        [ReadOnly] public ComponentTypeHandle<LocalToWorld> L2WType;
        [ReadOnly] public ComponentTypeHandle<Health01> HealthType;

        public NativeStream.Writer OutStream;

        public void Execute(int chunkIndex)
        {
            var chunk = Chunks[chunkIndex];
            var agents  = chunk.GetNativeArray(ref AgentType);
            var l2ws    = chunk.GetNativeArray(ref L2WType);
            var healths = chunk.GetNativeArray(ref HealthType);

            var writer = OutStream.AsWriter();
            writer.BeginForEachIndex(chunkIndex);

            for (int i = 0; i < chunk.Count; i++)
            {
                var vm = new AgentBlit
                {
                    Id       = agents[i].Id,
                    WorldPos = l2ws[i].Position,
                    Health01 = healths[i].Value,
                    Flags    = 0,
                    Version  = 0 // you can fill from your versioning source
                };
                writer.Write(vm);
            }
            writer.EndForEachIndex();
        }
    }

    [BurstCompile]
    private struct MergeJob : IJob
    {
        public NativeStream.Reader InStream;
        public Entity CacheE;

        public void Execute()
        {
            var total = InStream.Count();
            var em = World.DefaultGameObjectInjectionWorld.EntityManager;
            var buf = em.GetBuffer<AgentFrameCache>(CacheE);
            buf.Clear();
            buf.ResizeUninitialized(total);

            int dst = 0;
            for (int forEachIndex = 0; forEachIndex < InStream.ForEachCount; forEachIndex++)
            {
                InStream.BeginForEachIndex(forEachIndex);
                while (InStream.RemainingItemCount > 0)
                {
                    var blit = InStream.Read<AgentBlit>();
                    buf[dst++] = new AgentFrameCache { Value = blit };
                }
                InStream.EndForEachIndex();
            }
        }
    }
}
```

Why this is fast?

- ChangeFilter minimizes writes.
- NativeStream avoids contention and allocations in the hot loop.
- Single Burst-compiled merge copies tightly into SoA buffer once.

## 3 Drain (Presentation): main-thread handoff to your bridge

- Runs after producers.
- Copies the frame buffer to a pinned managed double-buffer (one memcpy) and calls your bridge later.
- Still no UI; this is the cache/bridge seam.

```c#
using System;
using System.Runtime.InteropServices;
using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

[BurstCompile]
[UpdateInGroup(typeof(PresentationSystemGroup))]
[UpdateAfter(typeof(AgentBlitProduceSystem))]
public partial struct AgentCacheDrainSystem : ISystem
{
    private AgentBlit[] _a, _b;
    private GCHandle _ha, _hb;
    private bool _useA;

    public void OnCreate(ref SystemState s)
    {
        Allocate(1024);
    }

    public void OnDestroy(ref SystemState s)
    {
        if (_ha.IsAllocated) _ha.Free();
        if (_hb.IsAllocated) _hb.Free();
    }

    public void OnUpdate(ref SystemState s)
    {
        s.Dependency.Complete(); // ensure producers done

        var cacheE = SystemAPI.GetSingletonEntity<AgentFrameCacheTag>();
        var buf    = s.EntityManager.GetBuffer<AgentFrameCache>(cacheE).AsNativeArray();

        EnsureCapacity(buf.Length);

        var dstArr = _useA ? _a : _b;
        var handle = _useA ? _ha : _hb;

        unsafe
        {
            void* dst = Marshal.UnsafeAddrOfPinnedArrayElement(dstArr, 0).ToPointer();
            void* src = buf.GetUnsafeReadOnlyPtr();
            long bytes = (long)buf.Length * sizeof(AgentBlit);
            Buffer.MemoryCopy(src, dst, dstArr.Length * sizeof(AgentBlit), bytes);
        }

        // Hand off to managed bridge here (no UI):
        // ECSViewBridge.ApplyAgentFrame(dstArr, buf.Length);

        _useA = !_useA;

        // Optional: clear buffer if you want “delta only” semantics next frame
        // (If you prefer additive deltas, remove this.)
        // s.EntityManager.GetBuffer<AgentFrameCache>(cacheE).Clear();
    }

    private void Allocate(int capacity)
    {
        _a = new AgentBlit[capacity];
        _b = new AgentBlit[capacity];
        _ha = GCHandle.Alloc(_a, GCHandleType.Pinned);
        _hb = GCHandle.Alloc(_b, GCHandleType.Pinned);
        _useA = true;
    }
    private void EnsureCapacity(int n)
    {
        if (n <= _a.Length) return;
        var cap = _a.Length;
        while (cap < n) cap <<= 1;

        if (_ha.IsAllocated) _ha.Free();
        if (_hb.IsAllocated) _hb.Free();
        Allocate(cap);
    }
}
```

You decide whether your cache emits full frames (as above) or deltas (keep buffer incremental and only push changed rows).

## 4 Make more shards (copy/paste)

For StructureBlit, ItemBlit, etc.:

- Define new struct StructureBlit : IBufferElementData { … }

Duplicate:

    - StructureFrameCacheTag, StructureFrameCache
    - StructureBlitProduceSystem (with its own source comps + ChangeFilters)
    - StructureCacheDrainSystem

This keeps systems small, data-oriented, and “hot path” tight for each domain.

## 5 Tuning & options

- Delta vs Full:
    - Full frames are simple and cache-friendly for your bridge.

- Deltas: keep a persistent DynamicBuffer<AgentFrameCache> (last known) and write only changed rows; your drain sends just those.
  (Add a DespawnIds buffer too.)

- Dirty partitioning:
    Partition the world into chunks (e.g., 64×64) and attach a DirtyTag to chunk entities; producers gather only from dirty chunks to keep spikes low.

- Versioning:
    If you attach Version to gameplay components, write through to AgentBlit.
    Version. Your bridge can skip re-renders when unchanged.

- Occupancy/hover side-channel:
    If you also need hover/neighbors per frame, add a tiny HoverContext singleton buffer and fill it in Simulation; drain alongside the cache.

- Allocator choice:
    WorldUpdateAllocator in producers ensures temporary data is freed at frame end; persistent memory lives only in the cache singleton/double buffer.

## 6 What you get

- Pure ECS/Jobs/ISystem cache path, Burst-compiled.
- Zero GC in hot loops; one memcpy/frame to managed.
- Works with OneJS/TS bridge cleanly (but no UI here).
- Easy to shard by data type; easy to switch to deltas.

