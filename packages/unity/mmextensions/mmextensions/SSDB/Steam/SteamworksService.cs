#if !UNITY_WEBGL && !UNITY_IOS && !UNITY_ANDROID

using UnityEngine;
using Cysharp.Threading.Tasks;
using Heathen.SteamworksIntegration;
using Heathen.SteamworksIntegration.API;
using System.Threading;
using VContainer;
using VContainer.Unity;

namespace KBVE.MMExtensions.SSDB.Steam
{
    public class SteamworksService : IAsyncStartable
    {
        private bool _initialized;

        public async UniTask StartAsync(CancellationToken cancellationToken)
        {
            Debug.Log("[SteamworksService] Initializing Steam...");

            App.Client.Initialize(2238370); // Replace with your App ID

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
    }
}

#endif
