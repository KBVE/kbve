using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Empire units carrying inventory or hungry get a ReturnToBase MovementGoal aimed at the Capital.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    public partial struct ReturnToBaseSystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<MovementGoal>();
        }

        [BurstCompile]
        public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            // Resolve the first capital once per frame. Swap this for a
            // per-unit "nearest capital" lookup when multiples land.
            int2 capitalHex = default;
            bool hasCapital = false;
            foreach (var b in SystemAPI.Query<RefRO<Building>>())
            {
                if (b.ValueRO.Type == BuildingType.Capital)
                {
                    capitalHex = b.ValueRO.RootHex;
                    hasCapital = true;
                    break;
                }
            }
            if (!hasCapital) return;  // nothing to return to yet

            new ReturnToBaseJob { CapitalHex = capitalHex }.ScheduleParallel();
        }
    }

    /// <summary>
    /// Per-unit return decision. Reads Energy + inventory, writes
    /// MovementGoal. Fully in-entity → lock-free across chunks.
    /// </summary>
    [BurstCompile]
    public partial struct ReturnToBaseJob : IJobEntity
    {
        public int2 CapitalHex;

        const float HungerThreshold = 0.30f;  // matches AutoEat / Withdraw

        void Execute(in Faction faction,
                     in Energy energy,
                     in DynamicBuffer<InventorySlot> inv,
                     in UnitMovement movement,
                     ref MovementGoal goal)
        {
            if (faction.Value != FactionType.Player) return;

            bool hungry   = energy.Max > 0f && energy.Value / energy.Max < HungerThreshold;
            bool carrying = HasAnyItems(inv);
            bool wantsReturn = hungry || carrying;

            if (wantsReturn)
            {
                // Only overwrite if our priority outranks the current
                // goal. Player click-to-move (Order, 100) wins over
                // autopilot; flee (200) wins over us too. Re-asserting
                // our own Return goal at the same priority is a no-op
                // write — cheap and stable.
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

            // No reason to go home anymore. If we're the ones holding
            // the goal, clear it so lower-priority behaviors (Wander)
            // can take over. Foreign goals stay untouched.
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

        static bool HasAnyItems(DynamicBuffer<InventorySlot> inv)
        {
            for (int i = 0; i < inv.Length; i++)
            {
                if (inv[i].Count > 0) return true;
            }
            return false;
        }
    }
}
