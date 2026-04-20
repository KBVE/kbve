using Unity.Entities;

namespace RareIcon
{
    [UpdateInGroup(typeof(BehaviorSystemGroup), OrderFirst = true)]
    public partial struct InventorySyncBarrierSystem : ISystem
    {
        public void OnCreate(ref SystemState state) { }
        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            state.EntityManager.CompleteDependencyBeforeRW<InventorySlot>();
            state.EntityManager.CompleteDependencyBeforeRW<EquippedBag>();
        }
    }
}
