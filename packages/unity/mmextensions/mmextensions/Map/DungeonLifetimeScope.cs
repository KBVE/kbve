using UnityEngine;
using VContainer;
using VContainer.Unity;

namespace KBVE.MMExtensions.Map
{
    public class DungeonLifetimeScope : LifetimeScope
    {
        [Header("Registry")]
        [SerializeField]
        private RoomRegistry roomRegistry;

        [Header("References")]
        [SerializeField]
        private RoomChunkManager chunkManager;

        [SerializeField]
        private RoomGraphManager graphManager;

        [SerializeField]
        private Transform gridTransform;

        [Header("Injectables")]
        [SerializeField]
        private DungeonBootstrapper bootstrapper;

        protected override void Configure(IContainerBuilder builder)
        {
            builder.RegisterComponent(roomRegistry);
            builder.RegisterComponent(chunkManager);
            builder.RegisterComponent(graphManager);
            builder.RegisterComponent(bootstrapper);
            builder.RegisterComponent(gridTransform);
            builder.Register<RoomFactory>(Lifetime.Singleton).As<IRoomFactory>();
        }
    }
}