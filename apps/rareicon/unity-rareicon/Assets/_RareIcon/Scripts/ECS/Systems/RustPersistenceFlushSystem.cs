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

        EntityQuery _liveBuildingQuery;
        EntityQuery _liveUnitQuery;

        readonly Dictionary<int2, List<FfiGhostUnit>> _unitsByChunk = new();

        protected override void OnCreate()
        {
            _liveBuildingQuery = GetEntityQuery(typeof(Building), typeof(BuildingHealth));
            _liveUnitQuery     = GetEntityQuery(typeof(Unit), typeof(UnitMovement));
        }

        protected override void OnUpdate()
        {
            _accum += SystemAPI.Time.DeltaTime;
            if (_accum < FlushIntervalSecs) return;
            _accum = 0f;
            FlushOnce("cadence");
        }

        /// <summary>Forces a synchronous flush + Rust SQLite WAL commit. Called by <see cref="RustPersistenceFlushHook"/> on app-pause / focus-loss / quit so a rage-quit doesn't lose the in-session state since the last cadence flush. Safe to call from the main thread; the underlying Rust write is brief.</summary>
        public void ForceFlushNow(string reason)
        {
            _accum = 0f;
            FlushOnce(reason);
        }

        void FlushOnce(string reason)
        {
            var nativeWorld = WorldStoreSystem.Instance;
            if (nativeWorld == null || !nativeWorld.IsValid) return;

            int buildings = FlushBuildings(nativeWorld);
            int units     = FlushUnits(nativeWorld);

            nativeWorld.Flush();
            bool buildingsChanged = buildings != _lastBuildingsCount;
            bool unitsChanged     = units     != _lastUnitsCount;
            if (buildingsChanged || unitsChanged)
            {
                Debug.Log($"[RustPersistenceFlush] ({reason}) upserted {buildings} buildings + {units} units across {_unitsByChunk.Count} chunks → SQLite WAL flushed");
                _lastBuildingsCount = buildings;
                _lastUnitsCount     = units;
            }
            _unitsByChunk.Clear();
        }

        int FlushBuildings(NativeWorld nativeWorld)
        {
            int unloadedCount = 0;
            if (SystemAPI.HasSingleton<BuildingsDBSingleton>())
            {
                var db = SystemAPI.GetSingleton<BuildingsDBSingleton>();
                if (db.Unloaded.IsCreated) unloadedCount = db.Unloaded.Length;
            }

            using var liveArr = _liveBuildingQuery.ToEntityArray(Unity.Collections.Allocator.Temp);
            int liveCount = liveArr.Length;
            int total = unloadedCount + liveCount;
            if (total == 0) return 0;

            var buf = new FfiUnloadedBuilding[total];
            int idx = 0;

            if (unloadedCount > 0)
            {
                var db = SystemAPI.GetSingleton<BuildingsDBSingleton>();
                for (int i = 0; i < unloadedCount; i++)
                    buf[idx++] = BuildingColdStoreOps.ToFfi(db.Unloaded[i]);
            }

            if (liveCount > 0)
            {
                var em       = EntityManager;
                uint nowTurn = SystemAPI.HasSingleton<WorldClock>()
                    ? SystemAPI.GetSingleton<WorldClock>().TurnIndex : 0u;
                float nowSecs = SystemAPI.HasSingleton<WorldClock>()
                    ? SystemAPI.GetSingleton<WorldClock>().AbsSeconds : 0f;

                for (int i = 0; i < liveCount; i++)
                {
                    var entity   = liveArr[i];
                    var building = em.GetComponentData<Building>(entity);
                    var health   = em.GetComponentData<BuildingHealth>(entity);
                    byte tier    = em.HasComponent<BuildingTier>(entity)
                        ? em.GetComponentData<BuildingTier>(entity).Value : (byte)0;

                    var rec = new UnloadedBuildingRecord
                    {
                        Type         = building.Type,
                        RootHex      = building.RootHex,
                        OwnerFaction = building.OwnerFaction,
                        Health       = health.Value,
                        HealthMax    = health.Max,
                        Tier         = tier,
                        LastTickTurn = nowTurn,
                        Flags        = building.OwnerFaction == FactionType.Hostile
                            ? UnloadedBuildingFlags.InHostileTerritory : (byte)0,
                    };

                    if (em.HasBuffer<ProductionRecipe>(entity))
                    {
                        var recipes = em.GetBuffer<ProductionRecipe>(entity);
                        if (recipes.Length > 0 && nowSecs > 0f)
                        {
                            float remaining = recipes[0].CycleEndsAt - nowSecs;
                            if (remaining > 0f) rec.RecipeCycleRemaining = remaining;
                            rec.Flags |= UnloadedBuildingFlags.HadRecipe;
                        }
                    }

                    BuildingColdStoreOps.SnapshotLedgerSlots(em, entity, building.Type, ref rec);
                    buf[idx++] = BuildingColdStoreOps.ToFfi(rec);
                }
            }

            nativeWorld.SaveBuildingsBatch(buf, total);
            return total;
        }

        int FlushUnits(NativeWorld nativeWorld)
        {
            _unitsByChunk.Clear();

            if (SystemAPI.HasSingleton<UnitsDBSingleton>())
            {
                var db = SystemAPI.GetSingleton<UnitsDBSingleton>();
                if (db.Unloaded.IsCreated)
                {
                    for (int i = 0; i < db.Unloaded.Length; i++)
                    {
                        var rec = db.Unloaded[i];
                        BucketUnit(UnitColdStoreOps.ToFfi(rec), rec.Hex);
                    }
                }
            }

            using (var liveArr = _liveUnitQuery.ToEntityArray(Unity.Collections.Allocator.Temp))
            {
                if (liveArr.Length > 0)
                {
                    float nowSecs = SystemAPI.HasSingleton<WorldClock>()
                        ? SystemAPI.GetSingleton<WorldClock>().AbsSeconds : 0f;
                    var em = EntityManager;
                    for (int i = 0; i < liveArr.Length; i++)
                    {
                        var entity = liveArr[i];
                        var rec = UnitColdStoreOps.Snapshot(em, entity, nowSecs);
                        BucketUnit(UnitColdStoreOps.ToFfi(rec), rec.Hex);
                    }
                }
            }

            if (_unitsByChunk.Count == 0) return 0;

            int total = 0;
            foreach (var kvp in _unitsByChunk) total += kvp.Value.Count;

            var flat   = new FfiGhostUnit[total];
            var ranges = new FfiChunkRange[_unitsByChunk.Count];
            int unitIdx  = 0;
            int rangeIdx = 0;
            foreach (var kvp in _unitsByChunk)
            {
                var bucket = kvp.Value;
                ranges[rangeIdx++] = new FfiChunkRange
                {
                    cx     = kvp.Key.x,
                    cy     = kvp.Key.y,
                    offset = (uint)unitIdx,
                    count  = (uint)bucket.Count,
                };
                for (int i = 0; i < bucket.Count; i++) flat[unitIdx++] = bucket[i];
            }

            nativeWorld.ReplaceChunksUnitsBulk(flat, total, ranges, ranges.Length);
            return total;
        }

        void BucketUnit(FfiGhostUnit ffi, int2 hex)
        {
            int2 chunk = new int2(
                (int)math.floor((float)hex.x / ChunkSize),
                (int)math.floor((float)hex.y / ChunkSize));
            if (!_unitsByChunk.TryGetValue(chunk, out var bucket))
            {
                bucket = new List<FfiGhostUnit>();
                _unitsByChunk[chunk] = bucket;
            }
            bucket.Add(ffi);
        }
    }
}
