using System;
using UnityEngine;
using VContainer;
using OneJS;
using R3;
using ObservableCollections;
using KBVE.MMExtensions.Orchestrator.DOTS;
using Unity.Mathematics;
using Unity.Collections.LowLevel.Unsafe;
using Unity.Collections;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Bridge
{
    public partial class DOTSBridge : MonoBehaviour, IDisposable
    {
        public static ResourceViewModel ResourceVM { get; private set; }

        [Inject] ResourceViewModel _vm;
        private readonly CompositeDisposable _comp = new();

        // Cache flag constants
        private const byte FLAG_HARVESTABLE = (byte)ResourceFlags.IsHarvestable;
        private const byte FLAG_DEPLETED = (byte)ResourceFlags.IsDepleted;

        // Reuse byte array to avoid allocations
        private byte[] _ulidBuffer = new byte[16];

        [EventfulProperty] byte[] _jsUlid = Array.Empty<byte>();
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

            ResourceVM.Current
                .Where(static x => x.HasValue)
                .Select(static x => x.Value)
                .ThrottleLastFrame(2)
                .DistinctUntilChanged()
                .ObserveOnMainThread()
                .Subscribe(UpdateUI)
                .AddTo(_comp);
        }

        private void UpdateUI(ResourceBlit rb)
        {
            CopyUlidToBuffer(rb.Ulid, _ulidBuffer);
            JsUlid = _ulidBuffer;
            JsType = rb.Type;
            JsFlags = rb.Flags;
            JsAmount = rb.Amount;
            JsMaxAmount = rb.MaxAmount;
            JsHarvestYield = rb.HarvestYield;
            JsHarvestTime = rb.HarvestTime;
            JsWorldPos = rb.WorldPos;

            JsHarvestable = ((rb.Flags & FLAG_HARVESTABLE) != 0) 
                            & (rb.Amount > 0) 
                            & ((rb.Flags & FLAG_DEPLETED) == 0);

            JsVisible = true;
        }

        private static unsafe void CopyUlidToBuffer(FixedBytes16 ulid, byte[] buffer)
        {
            fixed (byte* destPtr = buffer)
            {
                byte* srcPtr = (byte*)UnsafeUtility.AddressOf(ref ulid);
                UnsafeUtility.MemCpy(destPtr, srcPtr, 16);
            }
        }

        public void Dispose() => _comp.Dispose();
        
        private void OnDestroy() => Dispose();
    }
}