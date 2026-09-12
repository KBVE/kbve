using Unity.Collections;

namespace RareIcon
{
    /// <summary>Burst-safe append path for <see cref="QuestStartedMessage"/> / <see cref="QuestCompletedMessage"/>. Producers ( <see cref="QuestSeedSystem"/>, <see cref="QuestProgressSystem"/> ) must use this instead of calling NativeList.Add or IPublisher.Publish directly — keeps the single call shape for future sinks (Failed, ObjectiveProgressed, etc).</summary>
    public static class QuestEventSink
    {
        public static void AddStarted(ref NativeList<QuestStartedMessage> buffer, ushort questId)
        {
            buffer.Add(new QuestStartedMessage(questId));
        }

        public static void AddCompleted(ref NativeList<QuestCompletedMessage> buffer, ushort questId)
        {
            buffer.Add(new QuestCompletedMessage(questId));
        }
    }
}
