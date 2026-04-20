using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Decluster pass: assigns every unit a unique intra-hex slot so two units targeting the same hex don't stack on the same pixel. Build-bucket job partitions units by TargetHex into a NativeParallelMultiHashMap, then the assign job walks each unit's bucket and ranks by Entity.Index so the N-th smallest-index unit on a hex lands at slot N. Slot offset comes from a 19-point table (1 centre + 6-point ring at r=0.06 + 12-point ring at r=0.12) — keeps everyone inside the 0.25 hex radius. Missing HexSlotOffset components are added via ECB on first sight so spawn code doesn't have to remember to seed it. Runs in MovementSystemGroup before UnitMovementSystem so the target used for locomotion already carries the slot offset.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(MovementSystemGroup))]
    [UpdateBefore(typeof(UnitMovementSystem))]
    public partial struct HexSlotAssignSystem : ISystem
    {
        EntityQuery _unitQuery;

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            _unitQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<UnitMovement>()
                .Build(ref state);
            state.RequireForUpdate(_unitQuery);
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            int count = _unitQuery.CalculateEntityCount();
            if (count == 0) return;

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            // Seed HexSlotOffset on any unit that doesn't have it yet. Next
            // frame's rank pass will populate it with a real slot — this
            // frame the unit walks to the raw hex centre (Value = zero).
            state.Dependency = new SeedMissingSlotJob
            {
                Ecb = ecb.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);

            var clusters = new NativeParallelMultiHashMap<int2, Entity>(count * 2, Allocator.TempJob);

            state.Dependency = new PopulateHexClusterJob
            {
                Writer = clusters.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);

            state.Dependency = new AssignSlotJob
            {
                Clusters = clusters,
            }.ScheduleParallel(state.Dependency);

            state.Dependency = clusters.Dispose(state.Dependency);
        }
    }

    [BurstCompile]
    [WithAll(typeof(UnitMovement))]
    [WithNone(typeof(HexSlotOffset))]
    public partial struct SeedMissingSlotJob : IJobEntity
    {
        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity, [ChunkIndexInQuery] int chunkIdx)
        {
            Ecb.AddComponent(chunkIdx, entity, new HexSlotOffset { Value = float2.zero });
        }
    }

    [BurstCompile]
    public partial struct PopulateHexClusterJob : IJobEntity
    {
        public NativeParallelMultiHashMap<int2, Entity>.ParallelWriter Writer;

        void Execute(Entity entity, in UnitMovement movement)
        {
            Writer.Add(movement.TargetHex, entity);
        }
    }

    [BurstCompile]
    public partial struct AssignSlotJob : IJobEntity
    {
        [ReadOnly] public NativeParallelMultiHashMap<int2, Entity> Clusters;

        void Execute(Entity entity, in UnitMovement movement, ref HexSlotOffset offset)
        {
            int rank = 0;
            if (Clusters.TryGetFirstValue(movement.TargetHex, out var peer, out var it))
            {
                do
                {
                    if (peer.Index < entity.Index) rank++;
                } while (Clusters.TryGetNextValue(out peer, ref it));
            }

            offset.Value = SlotOffset(rank);
        }

        // 19-slot packing: 1 centre + 6 at r=0.06 + 12 at r=0.12. When a cluster
        // exceeds 19 units the slots wrap (rank % 19), so the 20th unit re-uses
        // the centre — acceptable fallback since overflow on a single 0.25-hex
        // is already a visual anomaly. Keeps the whole formation inside the hex.
        static float2 SlotOffset(int rank)
        {
            int slot = rank % 19;
            if (slot == 0) return float2.zero;
            if (slot < 7)
            {
                float a = (slot - 1) * (math.PI / 3f);
                return new float2(math.cos(a), math.sin(a)) * 0.06f;
            }
            float b = (slot - 7) * (math.PI / 6f);
            return new float2(math.cos(b), math.sin(b)) * 0.12f;
        }
    }
}
