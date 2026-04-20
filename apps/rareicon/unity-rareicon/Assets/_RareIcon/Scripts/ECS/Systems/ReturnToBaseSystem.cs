using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Converts a Player unit's active ReliefIntent (Eat/Sleep/Heal) or carried loot into a MovementGoal aimed at the Capital.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(ReliefSystem))]
    public partial struct ReturnToBaseSystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<MovementGoal>();
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            int2 capitalHex = SystemAPI.GetComponent<Building>(capital).RootHex;

            new ReturnToBaseJob { CapitalHex = capitalHex }.ScheduleParallel();
        }
    }

    [BurstCompile]
    [WithNone(typeof(ControlledUnitTag))]
    public partial struct ReturnToBaseJob : IJobEntity
    {
        public int2 CapitalHex;

        const int ReturnInventoryThreshold = 8;

        void Execute(in Faction faction,
                     in ReliefIntent intent,
                     in DynamicBuffer<InventorySlot> inv,
                     in UnitMovement movement,
                     ref MovementGoal goal)
        {
            if (faction.Value != FactionType.Player) return;

            bool reliefWantsCapital =
                intent.Kind == ReliefKind.Sleep ||
                intent.Kind == ReliefKind.Eat ||
                intent.Kind == ReliefKind.Heal;

            bool carrying = CountItems(inv) >= ReturnInventoryThreshold;
            bool wantsReturn = reliefWantsCapital || carrying;

            if (wantsReturn)
            {
                if (goal.Priority < GoalPriority.Return)
                {
                    goal = new MovementGoal
                    {
                        Kind      = GoalKind.ReturnToBase,
                        Priority  = GoalPriority.Return,
                        TargetHex = CapitalHex,
                    };
                }
                return;
            }

            if (goal.Kind == GoalKind.ReturnToBase)
            {
                goal = new MovementGoal
                {
                    Kind      = GoalKind.None,
                    Priority  = GoalPriority.None,
                    TargetHex = movement.CurrentHex,
                };
            }
        }

        static int CountItems(DynamicBuffer<InventorySlot> inv)
        {
            int total = 0;
            for (int i = 0; i < inv.Length; i++) total += inv[i].Count;
            return total;
        }
    }
}
