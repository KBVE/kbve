using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Drops every equipped item (shield, weapon, helmet, armor) onto the dying unit's hex so passersby of any faction can claim them. Faction-agnostic — Knight, Bandit, even a freshly slain Goblin sheds its full kit. Sister to <see cref="EnemyLootDropSystem"/>; that one drops UnitType-specific corpse loot, this one mirrors the unit's actual carried equipment.</summary>
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
            if (!HexLookup.TryGetValue(movement.CurrentHex, out var hex)) return;
            if (!DropLookup.HasBuffer(hex)) return;

            DropOne(ref equipment.ShieldItemId, ref equipment.ShieldHp, hex, chunkIdx);
            DropOne(ref equipment.WeaponItemId, ref equipment.WeaponHp, hex, chunkIdx);
            DropOne(ref equipment.HelmetItemId, ref equipment.HelmetHp, hex, chunkIdx);
            DropOne(ref equipment.ArmorItemId,  ref equipment.ArmorHp,  hex, chunkIdx);
        }

        void DropOne(ref ushort slot, ref ushort hp, Entity hex, int chunkIdx)
        {
            if (slot == 0) return;
            Ecb.AppendToBuffer(chunkIdx, hex, new ItemDrop { ItemId = slot, Count = 1, Hp = hp });
            slot = 0;
            hp   = 0;
        }
    }
}
