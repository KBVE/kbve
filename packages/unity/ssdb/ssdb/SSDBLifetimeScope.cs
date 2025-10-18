
using UnityEngine;
using VContainer;
using VContainer.Unity;
#if !UNITY_WEBGL && !UNITY_IOS && !UNITY_ANDROID
using KBVE.SSDB;
using KBVE.SSDB.Steam;
using KBVE.SSDB.SupabaseFDW;
using KBVE.SSDB.SupabaseFDW.UIUX;
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
        private static SSDBLifetimeScope _instance;
        
        [SerializeField]
        private bool autoStart = true;

        [SerializeField]
        private IRCConfig ircConfig;

        [SerializeField, Header("OneJS Integration")]
        private SteamBridge steamBridge;

        [SerializeField]
        private IRCBridge ircBridge;

        [SerializeField]
        private SupabaseBridge supabaseBridge;

        [SerializeField, Header("Script Engine")]
        private GameObject oneJSPersistentPrefab;

        protected override void Awake()
        {
            // Singleton pattern implementation
            if (_instance != null && _instance != this)
            {
                Debug.LogWarning("[SSDBLifetimeScope] Duplicate instance detected, destroying duplicate.");
                Destroy(gameObject);
                return;
            }

            _instance = this;
            base.Awake();
            DontDestroyOnLoad(this.gameObject);

            // Instantiate OneJS persistent prefab if provided
            //     if (oneJSPersistentPrefab != null)
            //     {
            //         var oneJSInstance = Instantiate(oneJSPersistentPrefab, transform);
            //         oneJSInstance.name = "OneJSPersistent";
            //         Debug.Log("[SSDBLifetimeScope] OneJS persistent components instantiated.");
            //     }
            // 
        }
        
        protected override void OnDestroy()
        {
            base.OnDestroy();
            
            // Clear the static instance if this is the one being destroyed
            if (_instance == this)
            {
                _instance = null;
            }
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

                // Register the bridge component if provided
                // Use RegisterComponent to ensure dependency injection
                if (steamBridge != null)
                {
                    builder.RegisterComponent(steamBridge);
                }

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

            builder.Register<SupabaseUIUX>(Lifetime.Singleton)
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

            builder.Register<SupabaseWebServer>(Lifetime.Singleton)
            .AsSelf()
            .As<IAsyncStartable>()
            .As<IDisposable>();

            // Register the Supabase bridge component if provided
            // Use RegisterComponent to ensure dependency injection
            if (supabaseBridge != null)
            {
                Debug.Log("[SSDBLifetimeScope] Registering SupabaseBridge component for VContainer injection");
                builder.RegisterComponent(supabaseBridge)
                    .As<IInitializable>();
            }
            else
            {
                Debug.LogError("[SSDBLifetimeScope] SupabaseBridge component is null - not registering with VContainer! Supabase functionality will not work.");
            }

            // IRC Services - Register at the end after all other services
            if (ircConfig != null)
            {
                builder.RegisterInstance(ircConfig);

                builder.Register<IRCService>(Lifetime.Singleton)
                    .AsSelf()
                    .As<IIRCService>()
                    .As<IAsyncStartable>()
                    .As<IDisposable>();

                // [Disabled] -> UnityUI IRC ChatBox
                // builder.Register<IRCTextBox>(Lifetime.Singleton)
                //     .AsSelf()
                //     .As<IAsyncStartable>()
                //     .As<IDisposable>();

                // Register the IRC bridge component if provided
                // Use RegisterComponent to ensure dependency injection
                if (ircBridge != null)
                {
                    builder.RegisterComponent(ircBridge)
                        .As<IInitializable>();
                }
            }

        }
    }
}
