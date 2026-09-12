using Unity.Burst;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Drains QuestBoardAcceptRequest entities — pulls the picked QuestId off the board buffer and pushes it onto QuestDBSingleton.PendingStart so QuestSeedSystem starts the quest next tick. Removes the slot, destroys the request entity. Same-frame-safe via EndSimulation ECB.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(QuestBoardRefreshSystem))]
    public partial struct QuestBoardAcceptSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<QuestBoardAcceptRequest>();
            state.RequireForUpdate<QuestDBSingleton>();
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            var dbRW = SystemAPI.GetSingletonRW<QuestDBSingleton>();
            ref var db = ref dbRW.ValueRW;
            var slotsLU = SystemAPI.GetBufferLookup<QuestBoardSlot>(false);

            foreach (var (req, reqEntity) in
                     SystemAPI.Query<RefRO<QuestBoardAcceptRequest>>().WithEntityAccess())
            {
                ecb.DestroyEntity(reqEntity);
                var board = req.ValueRO.Board;
                int idx   = req.ValueRO.SlotIndex;
                if (board == Entity.Null) continue;
                if (!slotsLU.HasBuffer(board)) continue;
                var slots = slotsLU[board];
                if (idx < 0 || idx >= slots.Length) continue;
                ushort qid = slots[idx].QuestId;
                slots.RemoveAtSwapBack(idx);
                db.PendingStart.Enqueue(qid);
            }
        }
    }
}
