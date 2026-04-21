using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;

namespace RareIcon
{
    /// <summary>Per-frame professions domain state. CommittedEvents is populated by ProfessionDispatchSystem every time a unit's ProfessionIntent changes and drained by ProfessionMessagePipeBridgeSystem. PipelineHandle reserved for future Burst split.</summary>
    public struct ProfessionsDBSingleton : IComponentData
    {
        public NativeList<ProfessionChangedMessage> CommittedEvents;
        public JobHandle                            PipelineHandle;
    }
}
