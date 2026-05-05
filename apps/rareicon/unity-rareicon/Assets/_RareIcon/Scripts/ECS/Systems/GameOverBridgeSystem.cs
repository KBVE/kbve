using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Drains <see cref="GameOverSignal"/> carrier entities on the main thread and flips <see cref="AppStateController"/> into <see cref="AppInterfaceState.GameOver"/>. Idempotent — duplicate signals (multiple Capitals destroyed in the same frame, future game-over triggers) collapse onto a single transition. Gated via <see cref="SystemBase.RequireForUpdate"/> so this system stays asleep until something queues a signal. Reaches the controller via <see cref="AppStateBridge"/> because ECS systems can't take VContainer constructor injection.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(PresentationSystemGroup))]
    public partial class GameOverBridgeSystem : SystemBase
    {
        EntityQuery _query;

        protected override void OnCreate()
        {
            _query = GetEntityQuery(ComponentType.ReadOnly<GameOverSignal>());
            RequireForUpdate(_query);
        }

        protected override void OnUpdate()
        {
            AppStateBridge.Source?.EnterGameOver();

            var em = EntityManager;
            using var entities = _query.ToEntityArray(Allocator.Temp);
            for (int i = 0; i < entities.Length; i++)
                em.DestroyEntity(entities[i]);
        }
    }
}
