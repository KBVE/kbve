#if !UNITY_WEBGL && !UNITY_IOS && !UNITY_ANDROID

using UnityEngine;
using VContainer;
using VContainer.Unity;
using KBVE.MMExtensions.SSDB.Steam;
namespace KBVE.MMExtensions.SSDB
{
    /// <summary>
    /// VContainer LifetimeScope for Steam-specific services.
    /// Only initialized on supported platforms.
    /// </summary>
    public class SSDBLifetimeScope : LifetimeScope
    {
        [SerializeField]
        private bool autoStart = true;

        protected override void Configure(IContainerBuilder builder)
        {
            if (autoStart)
            {
                builder.RegisterEntryPoint<SteamworksService>(Lifetime.Singleton);
            }
        }
    }
}

#endif