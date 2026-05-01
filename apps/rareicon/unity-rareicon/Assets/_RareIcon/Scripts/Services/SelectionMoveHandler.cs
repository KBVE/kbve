using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using MessagePipe;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using UnityEngine.InputSystem;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Bulk move-order executor — consumes SelectionMoveMessage and spreads every SelectedTag unit into a hex ring around the target. Units closest to the target take centre slots, so the click point is always honoured and only the overflow squad lands on adjacent rings. Default priority is <see cref="GoalPriority.Order"/> so the command overrides wander / harvest / hunt; holding Shift drops the priority to <see cref="GoalPriority.AttackMove"/> so Hunt can hijack mid-march and units engage hostiles encountered en route.</summary>
    public sealed class SelectionMoveHandler : IAsyncStartable, IDisposable
    {
        const float HexSize = 0.25f;
        const int MaxRingRadius = 4;

        readonly ISubscriber<SelectionMoveMessage> _moveSub;

        IDisposable _subscription;

        public SelectionMoveHandler(ISubscriber<SelectionMoveMessage> moveSub)
        {
            _moveSub = moveSub;
        }

        public UniTask StartAsync(CancellationToken cancellation)
        {
            var bag = DisposableBag.CreateBuilder();
            _moveSub.Subscribe(OnMove).AddTo(bag);
            _subscription = bag.Build();
            return UniTask.CompletedTask;
        }

        void OnMove(SelectionMoveMessage msg)
        {
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;

            var query = em.CreateEntityQuery(
                ComponentType.ReadOnly<SelectedTag>(),
                ComponentType.ReadOnly<LocalTransform>(),
                ComponentType.ReadWrite<MovementGoal>());
            int count = query.CalculateEntityCount();
            if (count == 0) return;

            using var entities = query.ToEntityArray(Allocator.Temp);

            byte priority = IsShiftHeld() ? GoalPriority.AttackMove : GoalPriority.Order;

            var order = new NativeArray<int>(count, Allocator.Temp);
            var dists = new NativeArray<float>(count, Allocator.Temp);
            var target = new int2(msg.Q, msg.R);
            var targetWorld = HexMeshUtil.HexToWorld(msg.Q, msg.R, HexSize);
            try
            {
                for (int i = 0; i < count; i++)
                {
                    order[i] = i;
                    var t = em.GetComponentData<LocalTransform>(entities[i]);
                    float dx = t.Position.x - targetWorld.x;
                    float dy = t.Position.y - targetWorld.y;
                    dists[i] = dx * dx + dy * dy;
                }
                for (int i = 1; i < count; i++)
                {
                    int key = order[i];
                    float keyDist = dists[key];
                    int j = i - 1;
                    while (j >= 0 && dists[order[j]] > keyDist)
                    {
                        order[j + 1] = order[j];
                        j--;
                    }
                    order[j + 1] = key;
                }

                int idx = 0;
                foreach (var slot in HexMeshUtil.Spiral(target, MaxRingRadius))
                {
                    if (idx >= count) break;
                    Entity e = entities[order[idx]];
                    em.SetComponentData(e, new MovementGoal
                    {
                        Kind      = GoalKind.MoveToHex,
                        Priority  = priority,
                        TargetHex = slot,
                    });
                    idx++;
                }
            }
            finally
            {
                order.Dispose();
                dists.Dispose();
            }
        }

        public void Dispose() => _subscription?.Dispose();

        static bool IsShiftHeld()
        {
            var kb = Keyboard.current;
            return kb != null && (kb.leftShiftKey.isPressed || kb.rightShiftKey.isPressed);
        }
    }
}
