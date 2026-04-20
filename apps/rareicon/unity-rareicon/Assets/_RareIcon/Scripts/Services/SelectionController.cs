using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using MessagePipe;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Managed bridge between SelectionDragMessage (from MessagePipe) and the ECS SelectedTag component. Listens for drag-ends, clears the current selection, then re-tags every Player-faction unit whose world XY lies inside the drag rect. Lives on the managed side for the same reason BuildCommandHandler does — MessagePipe + VContainer are both managed, and the world mutation is cheap (AddComponent/RemoveComponent per selected unit).</summary>
    public sealed class SelectionController : IAsyncStartable, IDisposable
    {
        readonly ISubscriber<SelectionDragMessage> _dragSub;

        IDisposable _subscription;

        public SelectionController(ISubscriber<SelectionDragMessage> dragSub)
        {
            _dragSub = dragSub;
        }

        public UniTask StartAsync(CancellationToken cancellation)
        {
            var bag = DisposableBag.CreateBuilder();
            _dragSub.Subscribe(OnDrag).AddTo(bag);
            _subscription = bag.Build();
            return UniTask.CompletedTask;
        }

        void OnDrag(SelectionDragMessage msg)
        {
            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;

            ClearSelection(em);

            var hitUnits = new NativeList<Entity>(32, Allocator.Temp);
            try
            {
                var query = em.CreateEntityQuery(
                    ComponentType.ReadOnly<Unit>(),
                    ComponentType.ReadOnly<Faction>(),
                    ComponentType.ReadOnly<LocalTransform>());
                using var arr = query.ToEntityArray(Allocator.Temp);
                for (int i = 0; i < arr.Length; i++)
                {
                    var faction = em.GetComponentData<Faction>(arr[i]);
                    if (faction.Value != FactionType.Player) continue;

                    var t = em.GetComponentData<LocalTransform>(arr[i]);
                    float2 p = new float2(t.Position.x, t.Position.y);
                    if (!(p.x >= msg.MinWorld.x && p.x <= msg.MaxWorld.x &&
                          p.y >= msg.MinWorld.y && p.y <= msg.MaxWorld.y)) continue;

                    hitUnits.Add(arr[i]);
                }

                for (int i = 0; i < hitUnits.Length; i++)
                    em.AddComponent<SelectedTag>(hitUnits[i]);
            }
            finally { hitUnits.Dispose(); }
        }

        /// <summary>Drops every <see cref="SelectedTag"/> in the world. Callable from input-cancel paths (ESC / right-click) so classic RTS "clear selection" gestures work without forcing an empty drag.</summary>
        public void Clear()
        {
            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;
            ClearSelection(world.EntityManager);
        }

        static void ClearSelection(EntityManager em)
        {
            var query = em.CreateEntityQuery(ComponentType.ReadOnly<SelectedTag>());
            if (query.CalculateEntityCount() == 0) return;
            em.RemoveComponent<SelectedTag>(query);
        }

        public void Dispose() => _subscription?.Dispose();
    }
}
