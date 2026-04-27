using System.Collections.Generic;
using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;
using RareIcon.Native;

namespace RareIcon
{
    /// <summary>Periodic flush of in-memory ghost-sim state back to the Rust SQLite store. Buildings + units that have been unloaded accumulate ghost-sim deltas (production / decay / hunger) that only persist when the chunk re-unloads — without periodic flush, a crash loses everything since the last unload. Building saves are upserted by root hex; unit saves currently append (uniqueness handled by chunk-replace on next unload). Cadence ~30s; also fires on app-pause via OnApplicationPauseHook.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial class RustPersistenceFlushSystem : SystemBase
    {
        const float FlushIntervalSecs = 60f;
        const int   ChunkSize         = 32;

        float _accum;
        int _lastBuildingsCount = -1;
        int _lastUnitsCount     = -1;

        readonly Dictionary<int2, List<FfiGhostUnit>> _unitsByChunk = new();

        protected override void OnUpdate()
        {
            _accum += SystemAPI.Time.DeltaTime;
            if (_accum < FlushIntervalSecs) return;
            _accum = 0f;

            var nativeWorld = WorldStoreSystem.Instance;
            if (nativeWorld == null || !nativeWorld.IsValid) return;

            int buildings = FlushBuildings(nativeWorld);
            int units     = FlushUnits(nativeWorld);

            nativeWorld.Flush();
            bool buildingsChanged = buildings != _lastBuildingsCount;
            bool unitsChanged     = units     != _lastUnitsCount;
            if (buildingsChanged || unitsChanged)
            {
                Debug.Log($"[RustPersistenceFlush] upserted {buildings} buildings + {units} units across {_unitsByChunk.Count} chunks → SQLite WAL flushed");
                _lastBuildingsCount = buildings;
                _lastUnitsCount     = units;
            }
            _unitsByChunk.Clear();
        }

        int FlushBuildings(NativeWorld nativeWorld)
        {
            if (!SystemAPI.HasSingleton<BuildingsDBSingleton>()) return 0;
            var db = SystemAPI.GetSingleton<BuildingsDBSingleton>();
            if (!db.Unloaded.IsCreated) return 0;

            int n = db.Unloaded.Length;
            if (n == 0) return 0;
            var buf = new FfiUnloadedBuilding[n];
            for (int i = 0; i < n; i++)
                buf[i] = BuildingColdStoreOps.ToFfi(db.Unloaded[i]);
            nativeWorld.SaveBuildingsBatch(buf, n);
            return n;
        }

        int FlushUnits(NativeWorld nativeWorld)
        {
            if (!SystemAPI.HasSingleton<UnitsDBSingleton>()) return 0;
            var db = SystemAPI.GetSingleton<UnitsDBSingleton>();
            if (!db.Unloaded.IsCreated) return 0;

            _unitsByChunk.Clear();
            for (int i = 0; i < db.Unloaded.Length; i++)
            {
                var rec = db.Unloaded[i];
                var ffi = UnitColdStoreOps.ToFfi(rec);
                int2 chunk = new int2(
                    (int)math.floor((float)rec.Hex.x / ChunkSize),
                    (int)math.floor((float)rec.Hex.y / ChunkSize));
                if (!_unitsByChunk.TryGetValue(chunk, out var bucket))
                {
                    bucket = new List<FfiGhostUnit>();
                    _unitsByChunk[chunk] = bucket;
                }
                bucket.Add(ffi);
            }

            int total = 0;
            foreach (var kvp in _unitsByChunk)
            {
                var arr = kvp.Value.ToArray();
                nativeWorld.ReplaceChunkUnits(kvp.Key.x, kvp.Key.y, arr, arr.Length);
                total += arr.Length;
            }
            return total;
        }
    }
}
