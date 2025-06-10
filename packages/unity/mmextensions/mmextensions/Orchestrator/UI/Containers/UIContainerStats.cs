using UnityEngine;
using UnityEngine.UI;
using TMPro;
using R3;
using KBVE.MMExtensions.Orchestrator.Health;
using System;


namespace KBVE.MMExtensions.Orchestrator.Core.UI
{
    public class UIContainerStats : MonoBehaviour, IDisposable
    {

        private readonly CompositeDisposable _subscription = new(); 


        public void Dispose()
        {
            _subscription?.Dispose();
        }

        private void OnDestroy()
        {
            Dispose();
        }
    }


}