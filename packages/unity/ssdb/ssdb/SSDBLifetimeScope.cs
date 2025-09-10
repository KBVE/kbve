
using UnityEngine;
using VContainer;
using VContainer.Unity;
#if !UNITY_WEBGL && !UNITY_IOS && !UNITY_ANDROID
using KBVE.SSDB;
using KBVE.SSDB.Steam;
using KBVE.SSDB.SupabaseFDW;
using KBVE.SSDB.IRC;
#endif
using System;

// TODO: Fix the SSDB Usage.

namespace KBVE.SSDB
{
    /// <summary>
    /// VContainer LifetimeScope for SSDB-specific services.
    /// Should be a child of OrchestratorLifetimeScope to access GlobalCanvas.
    /// </summary>
    public class SSDBLifetimeScope : LifetimeScope
    {
        [SerializeField]
        private bool autoStart = true;

        [SerializeField]
        private IRCConfig ircConfig;

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

                builder.RegisterComponentOnNewGameObject<SteamUserProfiles>(Lifetime.Singleton, "SteamUserProfiles")
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

            builder.Register<SupabaseMetrics>(Lifetime.Singleton)
            .AsSelf()
            .As<IAsyncStartable>()
            .As<IDisposable>();

            // IRC Services - Register at the end after all other services
            if (ircConfig != null)
            {
                builder.RegisterInstance(ircConfig);

                builder.Register<IRCService>(Lifetime.Singleton)
                    .AsSelf()
                    .As<IIRCService>()
                    .As<IAsyncStartable>()
                    .As<IDisposable>();

                builder.Register<IRCTextBox>(Lifetime.Singleton)
                    .AsSelf()
                    .As<IAsyncStartable>()
                    .As<IDisposable>();
            }

        }
    }
}
