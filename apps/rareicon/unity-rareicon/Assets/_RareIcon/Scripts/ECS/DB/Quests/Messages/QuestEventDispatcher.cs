using System.Collections.Generic;
using MessagePipe;
using Unity.Collections;

namespace RareIcon
{
    /// <summary>Coalesces a quest-event ReadBuffer by QuestId (last-write-wins) and publishes one event per distinct quest per frame. Mirrors <see cref="ProfessionEventDispatcher"/> — one managed class, two blittable message types.</summary>
    public interface IQuestEventDispatcher
    {
        void PublishStartedBatch(NativeList<QuestStartedMessage> native);
        void PublishCompletedBatch(NativeList<QuestCompletedMessage> native);
    }

    public sealed class QuestEventDispatcher : IQuestEventDispatcher
    {
        readonly IPublisher<QuestStartedMessage>   _startedPub;
        readonly IPublisher<QuestCompletedMessage> _completedPub;

        readonly HashSet<ushort> _startedSeen   = new(32);
        readonly HashSet<ushort> _completedSeen = new(32);

        public QuestEventDispatcher(
            IPublisher<QuestStartedMessage> startedPub,
            IPublisher<QuestCompletedMessage> completedPub)
        {
            _startedPub   = startedPub;
            _completedPub = completedPub;
        }

        public void PublishStartedBatch(NativeList<QuestStartedMessage> native)
        {
            if (!native.IsCreated || native.Length == 0) return;
            _startedSeen.Clear();
            for (int i = 0; i < native.Length; i++)
            {
                var msg = native[i];
                if (_startedSeen.Add(msg.QuestId))
                    _startedPub.Publish(msg);
            }
        }

        public void PublishCompletedBatch(NativeList<QuestCompletedMessage> native)
        {
            if (!native.IsCreated || native.Length == 0) return;
            _completedSeen.Clear();
            for (int i = 0; i < native.Length; i++)
            {
                var msg = native[i];
                if (_completedSeen.Add(msg.QuestId))
                    _completedPub.Publish(msg);
            }
        }
    }
}
