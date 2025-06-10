using UnityEngine;
using UnityEngine.UI;
using TMPro;
using R3;
using KBVE.MMExtensions.Orchestrator.Health;
using System;
using VContainer.Unity;
using Cysharp.Threading.Tasks;

namespace KBVE.MMExtensions.Orchestrator.Core.UI
{
    public class UIContainerStats : MonoBehaviour, IDisposable, IAsyncStartable
    {

        private readonly CompositeDisposable _subscription = new();
        private CancellationTokenSource _cts;



        public UniTask StartAsync(CancellationToken cancellation = default)
        {
            throw new NotImplementedException();
        }
        public void Dispose()
        {
            _cts?.Cancel();
            _cts?.Dispose();
            _subscription?.Dispose();
        }
        private void OnDestroy()
        {
            Dispose();
        }
    }


}