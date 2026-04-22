#if UNITY_EDITOR
using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;

namespace RareIcon
{
    /// <summary>Editor-only periodic dump of dispatcher state (job counts, activity, goals, movement, queue, harvest). Gated behind UNITY_EDITOR so it never ships in a player build. Runs on a 30-second cadence.</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(ProfessionDispatchSystem))]
    public partial class ProfessionDispatchDiagnosticSystem : SystemBase
    {
        const double DiagIntervalSeconds = 30.0;
        double _nextDiagTime = 3.0;

        protected override void OnUpdate()
        {
            if (SystemAPI.Time.ElapsedTime < _nextDiagTime) return;
            _nextDiagTime = SystemAPI.Time.ElapsedTime + DiagIntervalSeconds;
            Log();
        }

        void Log()
        {
            int totalUnits = 0, reliefBlocked = 0, controlled = 0, kindNone = 0;
            var jobKindCounts  = new int[14];
            var lastKindCounts = new int[24];
            var goalKindCounts = new int[8];
            var goalPrioBuckets = new int[6];
            int movementIdle = 0, movementStepping = 0, movementDwelling = 0;
            int queueEmpty = 0, queueActive = 0, queuePending = 0, queueInvalid = 0, queueCompleted = 0;
            int atTargetHarvestReady = 0, atTargetBlocked = 0, committedButIdle = 0;

            foreach (var (jobIntent, reliefIntent, state, goal, movement, tasksRef, entity) in
                     SystemAPI.Query<
                         RefRO<ProfessionIntent>,
                         RefRO<ReliefIntent>,
                         RefRO<ActivityState>,
                         RefRO<MovementGoal>,
                         RefRO<UnitMovement>,
                         DynamicBuffer<TaskMemory>>().WithEntityAccess())
            {
                totalUnits++;
                if (reliefIntent.ValueRO.Kind != ReliefKind.None) reliefBlocked++;
                if (EntityManager.HasComponent<ControlledUnitTag>(entity)) controlled++;

                byte k = jobIntent.ValueRO.Kind;
                if (k == ProfessionKind.None) kindNone++;
                else if (k < jobKindCounts.Length) jobKindCounts[k]++;

                byte lk = state.ValueRO.LastKind;
                if (lk < lastKindCounts.Length) lastKindCounts[lk]++;

                byte gk = goal.ValueRO.Kind;
                if (gk < goalKindCounts.Length) goalKindCounts[gk]++;

                byte gp = goal.ValueRO.Priority;
                if (gp == 0) goalPrioBuckets[0]++;
                else if (gp <= 10) goalPrioBuckets[1]++;
                else if (gp <= 30) goalPrioBuckets[2]++;
                else if (gp <= 40) goalPrioBuckets[3]++;
                else if (gp <= 50) goalPrioBuckets[4]++;
                else               goalPrioBuckets[5]++;

                var m = movement.ValueRO;
                bool isIdle = !(m.DwellTimer > 0f) && m.TargetHex.Equals(m.CurrentHex);
                if (m.DwellTimer > 0f) movementDwelling++;
                else if (isIdle) movementIdle++;
                else movementStepping++;

                var tasks = tasksRef;
                if (tasks.Length == 0) queueEmpty++;
                else
                {
                    byte st = tasks[0].State;
                    if (st == TaskState.Active)      queueActive++;
                    else if (st == TaskState.Pending) queuePending++;
                    else if (st == TaskState.Invalidated) queueInvalid++;
                    else if (st == TaskState.Completed)   queueCompleted++;
                }

                bool committed = tasks.Length > 0 && tasks[0].State == TaskState.Active;
                bool atTarget  = k != ProfessionKind.None && math.all(jobIntent.ValueRO.TargetHex == m.CurrentHex);
                if (atTarget)
                {
                    if (m.HarvestCooldown <= 0f) atTargetHarvestReady++;
                    else atTargetBlocked++;
                }
                if (committed && isIdle && !atTarget) committedButIdle++;
            }

            Debug.Log(
                $"[ProfessionDispatch diag] units={totalUnits} relief={reliefBlocked} controlled={controlled}\n" +
                $"  jobIntent:  None={kindNone} Lumberjack={jobKindCounts[ProfessionKind.Lumberjack]} Miner={jobKindCounts[ProfessionKind.Miner]} " +
                $"Guard={jobKindCounts[ProfessionKind.Guard]} Looter={jobKindCounts[ProfessionKind.Looter]} Farmer={jobKindCounts[ProfessionKind.Farmer]} " +
                $"Builder={jobKindCounts[ProfessionKind.Builder]} Chef={jobKindCounts[ProfessionKind.Chef]} Hunter={jobKindCounts[ProfessionKind.Hunter]} " +
                $"Blacksmith={jobKindCounts[ProfessionKind.Blacksmith]} Craftsman={jobKindCounts[ProfessionKind.Craftsman]}\n" +
                $"  activity:   None={lastKindCounts[0]} Idle={lastKindCounts[1]} Wandering={lastKindCounts[2]} MovingToOrder={lastKindCounts[3]} " +
                $"Sleeping={lastKindCounts[4]} Eating={lastKindCounts[5]} Healing={lastKindCounts[6]} ReturningToBase={lastKindCounts[7]} " +
                $"SeekingAid={lastKindCounts[8]} Foraging={lastKindCounts[9]} Lumberjacking={lastKindCounts[10]} Mining={lastKindCounts[11]} " +
                $"Hunting={lastKindCounts[12]} Looting={lastKindCounts[13]} Farming={lastKindCounts[14]} Building={lastKindCounts[15]} " +
                $"Cooking={lastKindCounts[16]} Guarding={lastKindCounts[17]} Traveling={lastKindCounts[18]} " +
                $"Crafting={lastKindCounts[19]} Smithing={lastKindCounts[20]}\n" +
                $"  goalKind:   None={goalKindCounts[GoalKind.None]} MoveToHex={goalKindCounts[GoalKind.MoveToHex]} " +
                $"ReturnToBase={goalKindCounts[GoalKind.ReturnToBase]} Wander={goalKindCounts[GoalKind.Wander]} " +
                $"Hunt={goalKindCounts[GoalKind.Hunt]} Flee={goalKindCounts[GoalKind.Flee]} Follow={goalKindCounts[GoalKind.Follow]}\n" +
                $"  goalPrio:   None={goalPrioBuckets[0]} Wander<=10={goalPrioBuckets[1]} Harvest<=30={goalPrioBuckets[2]} " +
                $"Hunt<=40={goalPrioBuckets[3]} Return<=50={goalPrioBuckets[4]} Order+={goalPrioBuckets[5]}\n" +
                $"  movement:   idle={movementIdle} stepping={movementStepping} dwelling={movementDwelling}\n" +
                $"  queue:      empty={queueEmpty} active={queueActive} pending={queuePending} invalidated={queueInvalid} completed={queueCompleted}\n" +
                $"  harvest:    atTarget_ready={atTargetHarvestReady} atTarget_cooling={atTargetBlocked} committed_but_idle={committedButIdle}");
        }
    }
}
#endif
