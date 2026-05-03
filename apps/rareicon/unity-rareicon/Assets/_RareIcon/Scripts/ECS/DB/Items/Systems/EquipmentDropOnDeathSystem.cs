using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Drops a dying unit's equipped shield as ground loot on its current hex so passersby (any faction's pickup loop) can claim it. Faction-agnostic — Knight, Bandit, even Goblin, all dump their shield. Companion to <see cref="EnemyLootDropSystem"/>; that one handles UnitType-specific corpse drops, this one handles the unit's actual carried equipment.</summary>
    [BurstCompile]
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    [UpdateAfter(typeof(EnemyLootDropSystem))]
    [UpdateBefore(typeof(DeathCleanupSystem))]
    public partial struct EquipmentDropOnDeathSystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state) => state.RequireForUpdate<DeadTag>();

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<HexDBSingleton>(out var hexLookup)) return;

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged).AsParallelWriter();

            state.Dependency = new EquipmentDropJob
            {
                HexLookup  = hexLookup.Lookup,
                DropLookup = SystemAPI.GetBufferLookup<ItemDrop>(true),
                Ecb        = ecb,
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    [WithAll(typeof(DeadTag))]
    public partial struct EquipmentDropJob : IJobEntity
    {
        [ReadOnly] public NativeHashMap<int2, Entity> HexLookup;
        [ReadOnly] public BufferLookup<ItemDrop>      DropLookup;

        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity,
                     [ChunkIndexInQuery] int chunkIdx,
                     in UnitMovement movement,
                     ref Equipment equipment)
        {
            if (equipment.ShieldItemId == 0) return;
            if (!HexLookup.TryGetValue(movement.CurrentHex, out var hex)) return;
            if (!DropLookup.HasBuffer(hex)) return;

            Ecb.AppendToBuffer(chunkIdx, hex,
                new ItemDrop { ItemId = equipment.ShieldItemId, Count = 1 });

            equipment.ShieldItemId = 0;
        }
    }
}
