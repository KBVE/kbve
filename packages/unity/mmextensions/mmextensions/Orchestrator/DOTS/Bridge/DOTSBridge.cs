using System;
using UnityEngine;
using VContainer;
using OneJS;
using R3;
//using R3.Unity;
using ObservableCollections;
using KBVE.MMExtensions.Orchestrator.DOTS;
using Unity.Mathematics;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Bridge
{
    public partial class DOTSBridge : MonoBehaviour, IDisposable
    {

        public static ResourceViewModel ResourceVM { get; private set; }

        [Inject] ResourceViewModel _vm;
        private readonly CompositeDisposable _comp = new();

        [EventfulProperty] byte[] _jsUlid = Array.Empty<byte>();   // 16 bytes
        [EventfulProperty] byte _jsType = 0;
        [EventfulProperty] byte _jsFlags = 0;
        [EventfulProperty] int _jsAmount = 0;
        [EventfulProperty] int _jsMaxAmount = 0;
        [EventfulProperty] int _jsHarvestYield = 0;
        [EventfulProperty] float _jsHarvestTime = 0f;
        [EventfulProperty] float3 _jsWorldPos = float3.zero;
        [EventfulProperty] bool _jsVisible = false;
        [EventfulProperty] bool _jsHarvestable = false;

        private void Start()
        {
            ResourceVM ??= _vm ?? new ResourceViewModel();

            //ResourceVM.Current
            ResourceVM.Current
                .Where(x => x.HasValue)
                .Select(x => x.Value)
                .DistinctUntilChanged()
                .ObserveOnMainThread()
                .Subscribe(UpdateUI)
                .AddTo(_comp);

        }
        
        private void UpdateUI(ResourceBlit rb)
        {
            JsUlid = rb.Ulid.ToArrayNoUnsafe();
            JsType = rb.Type;
            JsFlags = rb.Flags;
            JsAmount = rb.Amount;
            JsMaxAmount = rb.MaxAmount;
            JsHarvestYield = rb.HarvestYield;
            JsHarvestTime = rb.HarvestTime;

            //JsWorldPos

            const byte FLAG_HARVESTABLE = (byte)ResourceFlags.IsHarvestable;
            const byte FLAG_DEPLETED = (byte)ResourceFlags.IsDepleted;

            JsHarvestable = (rb.Flags & FLAG_HARVESTABLE) != 0
                            && rb.Amount > 0
                            && (rb.Flags & FLAG_DEPLETED) == 0;

            JsVisible = true;

        }


        public void Dispose() => _comp.Dispose();
    }
}