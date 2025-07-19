using UnityEngine;
using UnityEngine.UI;
using TMPro;
using R3;
using KBVE.MMExtensions.Orchestrator.Health;
using System;
using System.Threading;
using VContainer;
using VContainer.Unity;
using Cysharp.Threading.Tasks;
using KBVE.MMExtensions.Orchestrator.Interfaces;

namespace KBVE.MMExtensions.Orchestrator.Core.UI
{
    public class UIAuth : MonoBehaviour, IDisposable, IAsyncStartable
    {
        private CancellationTokenSource _cts;
        private bool _hasStarted = false;

        private readonly CompositeDisposable _subscription = new();

        private IGlobalCanvas _globalCanvas;
        private IHUDService _hudService;

        [Inject]
        public void Construct(IGlobalCanvas canvas, IHUDService hudService)
        {
            _globalCanvas = canvas;
            _hudService = hudService;
        }

        public async UniTask StartAsync(CancellationToken cancellation = default)
        {
            if (_hasStarted)
            {
                Debug.LogWarning("UIAuth has already started. Skipping duplicate initialization.");
                return;
            }

            try
            {
                _hasStarted = true;
                _cts = new CancellationTokenSource();
                var linkedToken = CancellationTokenSource.CreateLinkedTokenSource(_cts.Token, cancellation).Token;
                await UniTask.WaitUntil(() => _globalCanvas?.Canvas != null
                && _hudService?.HUDPanel != null, cancellationToken: linkedToken);
                await Operator.R();

                // await UniTask.CompletedTask;
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error in UIAuth.StartAsync: {ex.Message}");
                _hasStarted = false; // Reset flag on error to allow retry
                throw;
            }
        }

        // private async UniTask FetchWebDataAsync()
        // {
        //     await UniTask.SwitchToThreadPool();


        //     await UniTask.SwitchToMainThread();
        // }

        public void Dispose()
        {
            _cts?.Cancel();
            _cts?.Dispose();
            _subscription?.Dispose();
            _cts = null;
            _hasStarted = false;
        }

        private void OnDestroy()
        {
            Dispose();
        }

    }
}