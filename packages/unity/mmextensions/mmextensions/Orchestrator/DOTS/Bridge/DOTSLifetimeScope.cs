using VContainer;
using VContainer.Unity;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Bridge
{
    public sealed class DOTSLifetimeScope : LifetimeScope
    {
        protected override void Configure(IContainerBuilder builder)
        {
            // base.Configure(builder);
            builder.Register<EntityViewModel>(Lifetime.Singleton).AsSelf();
            //builder.RegisterComponentInHierarchy<EntityDOTSBridge>();
        }
    }
}