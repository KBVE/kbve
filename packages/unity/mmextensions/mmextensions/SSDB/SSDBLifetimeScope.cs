#if !UNITY_WEBGL && !UNITY_IOS && !UNITY_ANDROID

using UnityEngine;
using VContainer;
using VContainer.Unity;
using KBVE.MMExtensions.SSDB;
using KBVE.MMExtensions.SSDB.Steam;
using System;

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

        protected override void Awake()
        {
            base.Awake();
            DontDestroyOnLoad(this.gameObject);
        }

        protected override void Configure(IContainerBuilder builder)
        {
            if (autoStart)
            {

                builder.Register<SteamworksService>(Lifetime.Singleton)
                .AsSelf()
                .As<ISteamworksService>()
                .As<IAsyncStartable>()
                .As<IDisposable>();

            }


        }
    }
}

#endif