using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using Cysharp.Threading.Tasks;

namespace KBVE.Kilonet.Events
{

    public static class GlobalEvents
    {

        private static readonly ConcurrentDictionary<EventFlag, List<Func<object, UniTask>>> eventSubscribers =
            new ConcurrentDictionary<EventFlag, List<Func<object, UniTask>>>();

        public static void Subscribe(EventFlag eventFlag, Func<object, UniTask> callback)
        {
            if (callback == null) return;

            // Get or add a new subscriber list for the eventFlag
            var subscribers = eventSubscribers.GetOrAdd(eventFlag, _ => new List<Func<object, UniTask>>());

            lock (subscribers)
            {
                subscribers.Add(callback);
            }
        }

        public static void Unsubscribe(EventFlag eventFlag, Func<object, UniTask> callback)
        {
            if (callback == null) return;

            if (eventSubscribers.TryGetValue(eventFlag, out var subscribers))
            {
                lock (subscribers)
                {
                    subscribers.Remove(callback);

                    if (subscribers.Count == 0)
                    {
                        eventSubscribers.TryRemove(eventFlag, out _);
                    }
                }
            }
        }

        public static async UniTask TriggerEventsAsync(EventFlag eventFlags, object parameter = null)
        {
            foreach (EventFlag flag in Enum.GetValues(typeof(EventFlag)))
            {
                if ((eventFlags & flag) != 0)
                {
                    if (eventSubscribers.TryGetValue(flag, out var subscribers))
                    {
                        List<Func<object, UniTask>> safeSubscribers;
                        lock (subscribers)
                        {
                            safeSubscribers = new List<Func<object, UniTask>>(subscribers);
                        }

                        foreach (var subscriber in safeSubscribers)
                        {
                            await subscriber(parameter);
                        }
                    }
                }
            }
        }

        public static void ClearAllEvents()
        {
            foreach (var subscribers in eventSubscribers.Values)
            {
                lock (subscribers)
                {
                    subscribers.Clear();
                }
            }
            eventSubscribers.Clear();
        }
    }
}
