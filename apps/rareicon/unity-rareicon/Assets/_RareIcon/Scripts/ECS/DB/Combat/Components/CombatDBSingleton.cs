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
        public bool   InsideFriendlyTerritory;
    }

    /// <summary>World-level threat snapshot rebuilt each frame by CombatThreatScanSystem. Consumers (e.g. ProfessionDispatchSystem) read Threats + FriendlyEmitters instead of doing their own per-unit 13×13 spatial-hash scan. AnyThreatInFriendlyTerritory is a cheap global flag so the dispatcher can skip the list walk entirely when nobody has crossed the border. §0 event buffers land in Phase 2 when ThreatDetected / ThreatCleared subscribers exist.</summary>
    public struct CombatDBSingleton : IComponentData
    {
        public NativeList<ThreatRecord>     Threats;
        public NativeList<TerritoryEmitter> FriendlyEmitters;
        public bool                         AnyThreatInFriendlyTerritory;
        public JobHandle                    PipelineHandle;
    }
}
