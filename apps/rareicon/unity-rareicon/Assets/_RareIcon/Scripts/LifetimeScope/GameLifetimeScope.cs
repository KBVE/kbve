using UnityEngine;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    public class GameLifetimeScope : LifetimeScope
    {
        protected override void Configure(IContainerBuilder builder)
        {
            // ECS Systems registered into the default world
            // Systems use [Inject] method injection for dependencies
            builder.UseDefaultWorld(systems =>
            {
                // systems.Add<BulletPatternSystem>();
                // systems.Add<PlayerMovementSystem>();
            });

            // -- Entry Points --
        }

        protected override void Awake()
        {
            var rootScope = FindAnyObjectByType<RootLifetimeScope>();
            if (rootScope != null)
            {
                var parentRef = ParentReference.Create<RootLifetimeScope>();
                parentRef.Object = rootScope;
                parentReference = parentRef;
            }
            else
            {
                Debug.LogError("[GameLifetimeScope] RootLifetimeScope not found");
            }

            base.Awake();
        }
    }
}
