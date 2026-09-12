using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Drops UnitType-specific loot onto the hex when a Hostile / Beast unit dies. Sister to WildlifeLootDropSystem — gated on faction (and absence of PassiveAnimalTag) so passive animal drops don't double-fire here. Parallel Burst — each death appends ItemDrop elements via ECB.ParallelWriter; multiple deaths on the same hex don't race because AppendToBuffer is thread-safe.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    [UpdateBefore(typeof(DeathCleanupSystem))]
    public partial struct EnemyLootDropSystem : ISystem
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

            state.Dependency = new EnemyLootDropJob
            {
                HexLookup  = hexLookup.Lookup,
                DropLookup = SystemAPI.GetBufferLookup<ItemDrop>(true),
                Ecb        = ecb,
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    [WithAll(typeof(DeadTag))]
    [WithNone(typeof(PassiveAnimalTag))]
    public partial struct EnemyLootDropJob : IJobEntity
    {
        [ReadOnly] public NativeHashMap<int2, Entity> HexLookup;
        [ReadOnly] public BufferLookup<ItemDrop>      DropLookup;

        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity,
                     [ChunkIndexInQuery] int chunkIdx,
                     in UnitMovement movement,
                     in Unit unit,
                     in Faction faction)
        {
            byte f = faction.Value;
            if (f != FactionType.Hostile && f != FactionType.Beast) return;

            if (!HexLookup.TryGetValue(movement.CurrentHex, out var hex)) return;
            if (!DropLookup.HasBuffer(hex)) return;

            uint h = (uint)entity.Index * 0x9E3779B1u ^ (uint)entity.Version * 0x85EBCA77u;
            h ^= h >> 13; h *= 0xC2B2AE3Du; h ^= h >> 16;
            float r0 = ((h       ) & 0xFFFFu) / 65535f;
            float r1 = ((h >> 16 ) & 0xFFFFu) / 65535f;

            switch (unit.Type)
            {
                case UnitType.Wolf:
                    Append(Ecb, chunkIdx, hex, (ushort)ItemId.WolfPelt, 1);
                    if (r0 < 0.55f) Append(Ecb, chunkIdx, hex, (ushort)ItemId.WolfFang,
                        (ushort)(1 + (int)(r1 * 1.99f)));
                    break;
                case UnitType.Bandit:
                    Append(Ecb, chunkIdx, hex, (ushort)ItemId.Coin,
                        (ushort)(1 + (int)(r0 * 2.99f)));
                    if (r1 < 0.35f) Append(Ecb, chunkIdx, hex, (ushort)ItemId.Hood, 1);
                    break;
                case UnitType.Goblin:
                    Append(Ecb, chunkIdx, hex, (ushort)ItemId.Meat, 3);
                    break;
                case UnitType.Zombie:
                    Append(Ecb, chunkIdx, hex, (ushort)ItemId.Ash, 1);
                    Append(Ecb, chunkIdx, hex, (ushort)ItemId.Bone,
                        (ushort)(1 + (int)(r0 * 1.99f)));
                    if      (r1 < 0.10f) Append(Ecb, chunkIdx, hex, (ushort)ItemId.UnknownTome,   1);
                    else if (r1 < 0.30f) Append(Ecb, chunkIdx, hex, (ushort)ItemId.UnknownScroll, 1);
                    else if (r1 < 0.65f) Append(Ecb, chunkIdx, hex, (ushort)ItemId.UnknownKey,    1);
                    break;
                case UnitType.Whale:
                    Append(Ecb, chunkIdx, hex, (ushort)ItemId.Oil,  1);
                    Append(Ecb, chunkIdx, hex, (ushort)ItemId.Meat, 400);
                    break;
                case UnitType.Skeleton:
                    Append(Ecb, chunkIdx, hex, (ushort)ItemId.Bone,
                        (ushort)(2 + (int)(r0 * 2.99f)));
                    if (r1 < 0.40f) Append(Ecb, chunkIdx, hex, (ushort)ItemId.Ash, 1);
                    if (r1 > 0.85f) Append(Ecb, chunkIdx, hex, (ushort)ItemId.Coin,
                        (ushort)(1 + (int)(r0 * 1.99f)));
                    break;
            }
        }

        static void Append(EntityCommandBuffer.ParallelWriter ecb, int chunkIdx,
                           Entity hex, ushort itemId, ushort count)
        {
            if (count == 0) return;
            ecb.AppendToBuffer(chunkIdx, hex, new ItemDrop { ItemId = itemId, Count = count });
        }
    }
}
