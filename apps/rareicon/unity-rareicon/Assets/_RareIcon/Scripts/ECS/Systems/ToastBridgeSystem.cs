using MessagePipe;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Drains <see cref="PendingToast"/> carrier entities emitted by Burst-side systems and publishes them through MessagePipe to <see cref="ToastService"/>. Lives at the simulation/UI boundary because <see cref="IPublisher{T}"/> is a managed call and can't be invoked from Burst. Gated via <see cref="SystemBase.RequireForUpdate"/> so the system stays asleep until something actually queues a toast.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(PresentationSystemGroup))]
    public partial class ToastBridgeSystem : SystemBase
    {
        IPublisher<ToastMessage> _pub;
        EntityQuery _query;

        protected override void OnCreate()
        {
            _query = GetEntityQuery(ComponentType.ReadOnly<PendingToast>());
            RequireForUpdate(_query);
        }

        protected override void OnUpdate()
        {
            if (_pub == null)
            {
                try { _pub = GlobalMessagePipe.GetPublisher<ToastMessage>(); }
                catch { return; }
            }

            var em = EntityManager;
            using var entities = _query.ToEntityArray(Allocator.Temp);
            for (int i = 0; i < entities.Length; i++)
            {
                var carrier = entities[i];
                var pt = em.GetComponentData<PendingToast>(carrier);
                _pub.Publish(new ToastMessage(pt.Text.ToString(), (ToastKind)pt.Kind));
                em.DestroyEntity(carrier);
            }
        }
    }
}
