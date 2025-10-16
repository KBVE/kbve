using VContainer;
using VContainer.Unity;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Bridge
{
    public sealed class DOTSLifetimeScope : LifetimeScope
    {
        protected override void Configure(IContainerBuilder builder)
        {
            // Register EntityViewModel as singleton
            builder.Register<EntityViewModel>(Lifetime.Singleton).AsSelf();
        }
    }
}