using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;

namespace RareIcon
{
    /// <summary>Authoritative quest-domain state. <see cref="Defs"/> is a Burst-readable mirror of <see cref="QuestDB"/> populated once at <see cref="QuestsDomainSystem"/>.OnCreate. <see cref="PendingStart"/> is the auto-chain queue — <see cref="QuestRewardApplierSystem"/> pushes NextQuestId, <see cref="QuestSeedSystem"/> drains. Started/Completed events follow the same double-buffer pattern as <see cref="LogisticsDBSingleton"/> / <see cref="ProfessionsDBSingleton"/>: producers append to WriteBuffer via <see cref="QuestEventSink"/>; <see cref="QuestsDomainSystem"/> swaps WriteBuffer↔ReadBuffer each tick; <see cref="QuestsMessagePipeBridgeSystem"/> drains ReadBuffer. PipelineHandle serialises all pipeline phases.</summary>
    public struct QuestDBSingleton : IComponentData
    {
        public NativeHashMap<ushort, QuestDefRuntime> Defs;
        public NativeQueue<ushort>                    PendingStart;

        public NativeList<QuestStartedMessage>   StartedWriteBuffer;
        public NativeList<QuestStartedMessage>   StartedReadBuffer;
        public NativeList<QuestCompletedMessage> CompletedWriteBuffer;
        public NativeList<QuestCompletedMessage> CompletedReadBuffer;

        public JobHandle PipelineHandle;
        public uint      LastEvaluatedTurn;
    }
}
