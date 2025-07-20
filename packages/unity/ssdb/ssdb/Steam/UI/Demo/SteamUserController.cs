using Cysharp.Threading.Tasks;
using ObservableCollections;
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using TMPro;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UI;
using R3;
using VContainer;
using VContainer.Unity;
using KBVE.MMExtensions.Orchestrator;
using KBVE.MMExtensions.Orchestrator.Interfaces; // For IGlobalCanvas
using KBVE.SSDB.Steam; // For SteamworksService
using KBVE.SSDB.Steam.UI; // For SteamFriendViewModel, UI prefabs, etc.
using Heathen.SteamworksIntegration; // For UserData, Steam API types

namespace KBVE.SSDB.Steam.Demo
{
        public class SteamUserController : MonoBehaviour, IDisposable, IAsyncStartable
        {

            private CancellationTokenSource _cts;
            private CancellationToken _linkedToken;
            private CancellationTokenSource _linkedCts;


            private readonly CompositeDisposable _disposables = new();

            private SteamworksService _steamworksService;
            private IGlobalCanvas _globalCanvas;

            [Inject]
            public void Construct(SteamworksService steamworksService, IGlobalCanvas globalCanvas)
            {
                _steamworksService = steamworksService;
                _globalCanvas = globalCanvas;
            }

            private void Awake()
            {
                _cts = new CancellationTokenSource();
            }

            public async UniTask StartAsync(CancellationToken externalToken)
            {
                // &Guard
                if (_cts == null || _cts.Token == default)
                    {
                        Debug.LogWarning("[SteamUserController] _cts is not initialized or already disposed.");
                        return;
                    }
                    
                var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(_cts.Token, externalToken);
                _linkedToken = linkedCts.Token;

                try
                {
                    // &Guard
                    await Operator.R(); 
                    await UniTask.WaitUntil(() => _steamworksService.IsReady, cancellationToken: _linkedToken);

                    // TODO: Your logic here (e.g. render profiles, bind UI, etc.)
                    Debug.Log("[SteamUserController] Successfully initialized");
                }
                catch (OperationCanceledException)
                {
                    Debug.LogWarning("[SteamUserController] Initialization was canceled.");
                }
            }

            private void OnDestroy()
            {
                Dispose();
            }

            public void Dispose()
            {
                _cts?.Cancel();
                _cts?.Dispose();

                _linkedCts?.Cancel();
                _linkedCts?.Dispose();

                _disposables.Dispose();
            }

        }
}