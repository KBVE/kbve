#if !UNITY_WEBGL && !UNITY_IOS && !UNITY_ANDROID

using UnityEngine;
using Cysharp.Threading.Tasks;
using Heathen.SteamworksIntegration;
using Heathen.SteamworksIntegration.API;
using System.Threading;
using VContainer;
using VContainer.Unity;
using KBVE.MMExtensions.SSDB;

namespace KBVE.MMExtensions.SSDB.Steam
{
    public class SteamworksService : IAsyncStartable, ISteamworksService
    {
        private const int AppId = 2238370;
        private bool _initialized;
        public bool Initialized => _initialized;
        public UserData? LocalUser => _initialized ? UserData.Me : (UserData?)null;

        public async UniTask StartAsync(CancellationToken cancellationToken)
        {

            if (_initialized || App.Initialized)
            {
                Debug.Log("[SteamworksService] Already initialized.");
                return;
            }

            try
            {
                await UniTask.DelayFrame(1, cancellationToken: cancellationToken);

                Debug.Log("[SteamworksService] Initializing Steam...");

                App.Client.Initialize(2238370);

                await UniTask.WaitUntil(() => App.Initialized, cancellationToken: cancellationToken);

                if (App.Initialized)
                {
                    _initialized = true;
                    Debug.Log($"[SteamworksService] Logged in as: {UserData.Me.Name}");
                }
                else
                {
                    Debug.LogWarning("[SteamworksService] Steam initialization failed.");
                }
            }
            catch (OperationCanceledException)
            {
                Debug.LogWarning("[SteamworksService] Initialization was canceled.");
            }
            catch (System.Exception ex)
            {
                Debug.LogError($"[SteamworksService] Unexpected error during Steam initialization: {ex}");
            }

        }
    }
}

#endif
