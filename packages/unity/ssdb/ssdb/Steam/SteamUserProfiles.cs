#if !UNITY_WEBGL && !UNITY_IOS && !UNITY_ANDROID

using System;
using System.Threading;
using System.Linq;
using Cysharp.Threading.Tasks;
//using Cysharp.Threading.Tasks.Addressables;
using UnityEngine;
using VContainer;
using VContainer.Unity;
using R3;
using ObservableCollections;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using KBVE.MMExtensions.Quests;
using Achievements = Heathen.SteamworksIntegration.API.StatsAndAchievements.Client;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;
using KBVE.MMExtensions.Orchestrator;
using KBVE.MMExtensions.Orchestrator.Core;
using KBVE.MMExtensions.Orchestrator.Core.UI;
using KBVE.MMExtensions.Orchestrator.Interfaces;
using Heathen.SteamworksIntegration;
using Heathen.SteamworksIntegration.UI;
using API = Heathen.SteamworksIntegration.API;
using KBVE.SSDB.Steam.UI;
//using TMPro;

namespace KBVE.SSDB.Steam
{
        public class SteamUserProfiles : MonoBehaviour, IAsyncStartable, IDisposable //IUserProfile
        {

            private readonly CompositeDisposable _disposables = new();
            private CancellationTokenSource _cts;
            private SteamworksService _steamworksService;
            private IGlobalCanvas _globalCanvas;

            [Inject]
            public void Construct(SteamworksService steamworksService, IGlobalCanvas globalCanvas)
            {
                _steamworksService = steamworksService;
                _globalCanvas = globalCanvas;
            }

            public async UniTask StartAsync(CancellationToken cancellationToken)
            {
                _cts = new CancellationTokenSource();
                var linkedToken = CancellationTokenSource.CreateLinkedTokenSource(_cts.Token, cancellationToken).Token;

                try
                {
                    // Wait for SteamworksService and GlobalCanvasService readiness
                    await UniTask.WhenAll(
                        UniTask.WaitUntil(() => _steamworksService.IsReady, cancellationToken: linkedToken),
                        UniTask.WaitUntil(() => _globalCanvas.Canvas != null, cancellationToken: linkedToken),
                        Operator.R()
                    );

                    // Optional: wait for internal "IsReady" flag on GlobalCanvasService
                    if (_globalCanvas is GlobalCanvasService gcs)
                    {
                        await UniTask.WaitUntil(() => gcs.IsReady.Value, cancellationToken: linkedToken);
                    }

                    Debug.Log("[SteamUserProfiles] Services ready, proceeding to UI setup...");

                    await RenderLocalUserAsync(linkedToken);
                }
                catch (OperationCanceledException)
                {
                    Debug.LogWarning("[SteamUserProfiles] Initialization canceled.");
                }
            }

            private async UniTask RenderLocalUserAsync(CancellationToken token)
            {
                var localUserNullable = _steamworksService.LocalUser.Value;
                if (localUserNullable is not UserData localUser)
                {
                    Debug.LogWarning("[SteamUserProfiles] No local user found.");
                    return;
                }

                var prefab = await Addressables.LoadAssetAsync<GameObject>("UI/UserProfile").Task;
                var panelGO = _globalCanvas.SpawnPanel(prefab, UICanvasLayer.HUD);

                if (!panelGO.TryGetComponent(out UIStreamUserProfile uiProfile))
                {
                    Debug.LogError("[SteamUserProfiles] Spawned profile panel missing UIStreamUserProfile.");
                    return;
                }

                await uiProfile.BindAsync(new SteamFriendViewModel
                {
                    Name = localUser.Name,
                    Status = localUser.State.ToString(),
                    AvatarTask = UniTask.Create(() =>
                    {
                        var tcs = new UniTaskCompletionSource<Texture2D?>();
                        localUser.LoadAvatar(t => tcs.TrySetResult(t));
                        return tcs.Task;
                    }),
                    RawSteamUser = localUser
                });
            }


            public void Dispose()
            {
                _cts?.Cancel();
                _cts?.Dispose();
                _disposables.Dispose();
            }
            

        }

}

#endif