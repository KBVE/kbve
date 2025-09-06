
using UnityEngine;
using VContainer;
using VContainer.Unity;
#if !UNITY_WEBGL && !UNITY_IOS && !UNITY_ANDROID
using KBVE.SSDB;
using KBVE.SSDB.Steam;
using KBVE.SSDB.SupabaseFDW;
#endif

using System;

namespace KBVE.SSDB
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
#if !UNITY_WEBGL && !UNITY_IOS && !UNITY_ANDROID
            if (autoStart)
            {

                builder.Register<SteamworksService>(Lifetime.Singleton)
                .AsSelf()
                .As<ISteamworksService>()
                .As<IAsyncStartable>()
                .As<IDisposable>();

                builder.RegisterComponentOnNewGameObject<SteamAchievements>(Lifetime.Singleton, "SteamAchievements")
                .DontDestroyOnLoad()
                .AsSelf()
                .As<IAsyncStartable>()
                .As<IDisposable>();

            }
#else
                Debug.LogWarning("[SSDBLifetimeScope] Steamworks integration is disabled or not supported on this platform.");
#endif

            builder.Register<SupabaseInstance>(Lifetime.Singleton)
            .AsSelf()
            .As<ISupabaseInstance>()
            .As<IAsyncStartable>()
            .As<IDisposable>();

            builder.Register<SupabaseAuthFDW>(Lifetime.Singleton)
            .AsSelf()
            .As<IAsyncStartable>()
            .As<IDisposable>();

            builder.Register<SupabaseRealtimeFDW>(Lifetime.Singleton)
            .AsSelf()
            .As<IAsyncStartable>()
            .As<IDisposable>();

            builder.Register<SupabaseBroadcastFDW>(Lifetime.Singleton)
            .AsSelf()
            .As<IAsyncStartable>()
            .As<IDisposable>();


        }
    }
}
