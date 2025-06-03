#if !UNITY_WEBGL && !UNITY_IOS && !UNITY_ANDROID

using UnityEngine;
using Cysharp.Threading.Tasks;
using Heathen.SteamworksIntegration;
using Heathen.SteamworksIntegration.API;
using System.Threading;
using System;
using VContainer;
using VContainer.Unity;
using KBVE.MMExtensions.SSDB;
using R3;
using ObservableCollections;

namespace KBVE.MMExtensions.SSDB.Steam
{
    public class SteamworksService : IAsyncStartable, ISteamworksService
    {
        private readonly Lazy<ISteamWorker> _lazyWorker;

        public ISteamWorker Worker => _lazyWorker.Value;


        private const int AppId = 2238370;

        public ReactiveProperty<bool> Initialized { get; } = new(false);
        public ReactiveProperty<UserData?> LocalUser { get; } = new(null);

        public SteamworksService(Lazy<ISteamWorker> lazyWorker)
        {
            _lazyWorker = lazyWorker;
        }

        public async UniTask StartAsync(CancellationToken cancellationToken)
        {
            try
            {
                if (App.Initialized)
                {
                    Initialized.Value = true;
                    LocalUser.Value = UserData.Me;
                    await Worker.InitializeAsync(cancellationToken);
                    return;
                }

                Debug.Log("[SteamworksService] Initializing Steam...");

                App.Client.Initialize(AppId);

                await UniTask.WaitUntil(() => App.Initialized, cancellationToken: cancellationToken);

                Initialized.Value = true;
                LocalUser.Value = UserData.Me;

                Debug.Log($"[SteamworksService] Logged in as {UserData.Me.Name}");

                await Worker.InitializeAsync(cancellationToken);
            }
            catch (OperationCanceledException)
            {
                Debug.LogWarning("[SteamworksService] Initialization was canceled.");
            }
            catch (Exception ex)
            {
                Debug.LogError($"[SteamworksService] Unexpected error during Steam initialization: {ex}");
            }
        }

    }
}

#endif
