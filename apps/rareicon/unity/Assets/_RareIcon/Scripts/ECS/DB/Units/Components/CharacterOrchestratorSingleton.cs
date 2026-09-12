using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Stable byte ID per local controller (player/AI/spectator). Single-player keeps everything on <see cref="Local"/>; split-screen / spectator / cinematic-camera contexts get their own ID so each controller's possess history stays independent. Issue 4906 calls out hardcoded "Player1" refs scattered through the click router + camera; routing through this enum is the migration path away from those.</summary>
    public static class ControllerId
    {
        public const byte Local      = 0;
        public const byte Spectator  = 1;
        public const byte Cinematic  = 2;
    }

    /// <summary>Registry of controller-id → currently-possessed entity, plus a bounded swap-back history per controller. Owned by <see cref="CharacterOrchestratorDomainSystem"/>; mutated through the static <see cref="CharacterOrchestrator"/> helper so call sites never touch the raw containers. Replaces the old O(N) ControlledUnitTag scan in <see cref="PossessSystem"/> with an O(1) lookup and gives the camera / HUD / save-slot service a single source of truth for "who is the player driving right now."</summary>
    public struct CharacterOrchestratorSingleton : IComponentData
    {
        /// <summary>Currently-possessed entity per controller. Missing key = controller has no active possession.</summary>
        public NativeHashMap<byte, Entity> Active;

        /// <summary>Swap-back history. Most-recent at the back; capped at <see cref="HistoryCap"/> to bound memory. Key encoded as <c>(controllerId &lt;&lt; 24) | slotIndex</c> so one container holds every controller's stack — saves an extra HashMap of HashMaps.</summary>
        public NativeList<HistoryEntry> History;

        public const int HistoryCap = 8;
    }

    /// <summary>One entry in the swap-back history. Recent first; older entries pruned past <see cref="CharacterOrchestratorSingleton.HistoryCap"/>.</summary>
    public struct HistoryEntry
    {
        public byte   ControllerId;
        public Entity Entity;
    }
}
