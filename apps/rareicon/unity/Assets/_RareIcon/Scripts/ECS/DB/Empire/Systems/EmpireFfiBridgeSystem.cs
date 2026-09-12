using System;
using RareIcon.Native;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Phase 2/2.5 — bridges <see cref="EmpireSnapshotCache"/> to the uniti FFI on a slow cadence so Rust owns the canonical strategic state for unloaded-region cities. Calls <see cref="Uniti.uniti_empire_async_start"/> on first run so the Rust tokio runtime starts a 1s background ticker that drives <c>uniti_empire_tick</c> independently of Unity's frame loop. Each cycle here only publishes Unity-built deltas + pulls Rust-authored deltas back; the strategic simulation itself runs Rust-side. Stops the runtime in <see cref="OnStopRunning"/> so save-and-quit shuts down cleanly.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(EmpireSystemGroup))]
    [UpdateAfter(typeof(EmpireSnapshotExportSystem))]
    public partial class EmpireFfiBridgeSystem : SystemBase
    {
        const float BridgeIntervalSeconds = 5f;

        float _accum;
        ulong _lastPublished;
        byte[] _scratch = Array.Empty<byte>();
        bool _runtimeStarted;
        int _bridgeAtGeneration = -1;

        protected override void OnStopRunning()
        {
            if (_runtimeStarted)
            {
                Uniti.uniti_empire_async_stop();
                _runtimeStarted = false;
            }
        }

        protected override unsafe void OnUpdate()
        {

            if (UnitSpawnSystem.RespawnGeneration != _bridgeAtGeneration)
            {
                _runtimeStarted = false;
                _lastPublished  = 0;
                _bridgeAtGeneration = UnitSpawnSystem.RespawnGeneration;
            }

            if (!_runtimeStarted)
            {
                int started = Uniti.uniti_empire_async_start();
                _runtimeStarted = started == 1;
            }

            _accum += SystemAPI.Time.DeltaTime;
            if (_accum < BridgeIntervalSeconds) return;
            _accum = 0f;

            var bytes = EmpireSnapshotCache.LatestBytes;
            ulong gen = EmpireSnapshotCache.Generation;

            if (bytes != null && bytes.Length > 0 && gen != _lastPublished)
            {
                fixed (byte* p = bytes)
                {
                    Uniti.uniti_empire_publish(p, (nuint)bytes.Length);
                }
                _lastPublished = gen;
            }

            nuint len = Uniti.uniti_empire_snapshot_len();
            if (len == 0) return;
            int size = (int)len;
            if (_scratch.Length < size) _scratch = new byte[size];

            nuint copied;
            fixed (byte* p = _scratch)
            {
                copied = Uniti.uniti_empire_take(p, (nuint)_scratch.Length);
            }
            if (copied == 0) return;

            var view = new byte[(int)copied];
            Buffer.BlockCopy(_scratch, 0, view, 0, view.Length);
            EmpireSnapshotCache.ApplyIncoming(view);
        }
    }
}
