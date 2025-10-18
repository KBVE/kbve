using VContainer;
using VContainer.Unity;
using KBVE.MMExtensions.Orchestrator.DOTS;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Bridge
{
    public sealed class DOTSLifetimeScope : LifetimeScope
    {
        protected override void Configure(IContainerBuilder builder)
        {
            // Register EntityViewModel as singleton
            builder.Register<EntityViewModel>(Lifetime.Singleton).AsSelf();

            // Register EntityCollection as singleton for cache statistics and reactive UI
            // &&VContainer Issue with ECS
            //builder.RegisterComponentInHierarchy<EntityCollection>();
            //builder.RegisterComponentOnNewGameObject<EntityCollection>(Lifetime.Scoped, "EntityCollection");
        }
    }
}