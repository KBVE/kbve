using UnityEngine;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    public class GameLifetimeScope : LifetimeScope
    {
        protected override void Configure(IContainerBuilder builder)
        {

            builder.UseDefaultWorld(systems =>
            {

            });

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
