using System;
using RareIcon.Native;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Phase 2 — bridges <see cref="EmpireSnapshotCache"/> to the uniti FFI on a slow cadence so the Rust crate owns the canonical strategic state for unloaded-region cities. Each cycle: publish the latest Unity-built snapshot bytes, ask Rust to tick, then pull whatever Rust returned and feed it to <see cref="EmpireSnapshotImportSystem"/> via <see cref="EmpireSnapshotCache.ApplyIncoming"/>. The actual mood drift / tribute simulation in Rust is a Phase 2.5 follow-up; today the Rust side echoes bytes back unchanged, validating the round-trip without Unity-side hacks.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(EmpireSystemGroup))]
    [UpdateAfter(typeof(EmpireSnapshotExportSystem))]
    public partial class EmpireFfiBridgeSystem : SystemBase
    {
        const float BridgeIntervalSeconds = 5f;

        float _accum;
        ulong _lastPublished;
        byte[] _scratch = Array.Empty<byte>();

        protected override unsafe void OnUpdate()
        {
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

            Uniti.uniti_empire_tick();

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
