using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Per-frame snapshot of one hostile entity inside the combat scan. InsideFriendlyTerritory is set when Hex lies within any Player-owned TerritoryEmitter, so consumers can prefer defenders-at-home without redoing the containment check.</summary>
    public struct ThreatRecord
    {
        public Entity Entity;
        public float2 Position;
        public int2   Hex;
        public byte   Faction;
        public byte   UnitType;
        public bool   InsideFriendlyTerritory;
    }

    /// <summary>World-level combat state. Threats + FriendlyEmitters are per-frame snapshots rebuilt by CombatThreatScanSystem; ProfessionDispatchSystem reads them instead of running its own spatial-hash scan. Event streams (ThreatDetected/Cleared, UnitKilled, BuildingDestroyed) are sim-internal double-buffered NativeLists — producers append to WriteBuffer this frame, consumers drain ReadBuffer next frame, CombatDomainSystem swaps them at OrderFirst. PreviousFrameThreats tracks last tick's hostile entity set for edge-detection. No managed bridge yet — all consumers are Burst ISystems.</summary>
    public struct CombatDBSingleton : IComponentData
    {
        public NativeList<ThreatRecord>     Threats;
        public NativeList<TerritoryEmitter> FriendlyEmitters;
        public NativeList<TerritoryEmitter> HostileEmitters;
        public JobHandle                    PipelineHandle;

        public NativeParallelHashSet<Entity> PreviousFrameThreats;

        public NativeList<ThreatDetectedRecord>    ThreatDetectedWriteBuffer;
        public NativeList<ThreatDetectedRecord>    ThreatDetectedReadBuffer;
        public NativeList<ThreatClearedRecord>     ThreatClearedWriteBuffer;
        public NativeList<ThreatClearedRecord>     ThreatClearedReadBuffer;
        public NativeList<UnitKilledRecord>        UnitKilledWriteBuffer;
        public NativeList<UnitKilledRecord>        UnitKilledReadBuffer;
        public NativeList<BuildingDestroyedRecord> BuildingDestroyedWriteBuffer;
        public NativeList<BuildingDestroyedRecord> BuildingDestroyedReadBuffer;
    }
}
