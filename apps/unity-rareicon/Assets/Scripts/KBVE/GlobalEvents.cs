using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using Cysharp.Threading.Tasks;

namespace KBVE
{
    /// <summary>
    /// Global event manager that combines bitwise operations and thread-safe handling using ConcurrentDictionary.
    /// Each event is managed using bitwise flags, and subscribers are stored in a ConcurrentDictionary for thread-safe access.
    /// </summary>
    public static class GlobalEvents
    {
        /// <summary>
        /// Dictionary to hold event subscribers. Each key represents an event flag, and each value is a list of async callbacks.
        /// </summary>
        private static readonly ConcurrentDictionary<EventFlag, List<Func<object, UniTask>>> eventSubscribers =
            new ConcurrentDictionary<EventFlag, List<Func<object, UniTask>>>();

        /// <summary>
        /// Subscribe to an event using the specified bitwise flag.
        /// </summary>
        /// <param name="eventFlag">The bitwise flag representing the event.</param>
        /// <param name="callback">The async callback to invoke when the event is triggered.</param>
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

        /// <summary>
        /// Unsubscribe from an event using the specified bitwise flag.
        /// </summary>
        /// <param name="eventFlag">The bitwise flag representing the event.</param>
        /// <param name="callback">The async callback to remove from the event.</param>
        public static void Unsubscribe(EventFlag eventFlag, Func<object, UniTask> callback)
        {
            if (callback == null) return;

            if (eventSubscribers.TryGetValue(eventFlag, out var subscribers))
            {
                lock (subscribers)
                {
                    subscribers.Remove(callback);

                    // If no subscribers are left, remove the key from the dictionary
                    if (subscribers.Count == 0)
                    {
                        eventSubscribers.TryRemove(eventFlag, out _);
                    }
                }
            }
        }

        /// <summary>
        /// Trigger events asynchronously based on the active bitwise flags.
        /// All subscribers for the active flags will be invoked asynchronously.
        /// </summary>
        /// <param name="eventFlags">The bitwise flags indicating which events to trigger.</param>
        /// <param name="parameter">Optional parameter to pass to the event listeners.</param>
        /// <returns>A <see cref="UniTask"/> representing the asynchronous operation of all event callbacks.</returns>
        public static async UniTask TriggerEventsAsync(EventFlag eventFlags, object parameter = null)
        {
            // Iterate through each set bit in the eventFlags
            foreach (EventFlag flag in Enum.GetValues(typeof(EventFlag)))
            {
                // Check if the bit corresponding to the flag is set in eventFlags
                if ((eventFlags & flag) != 0)
                {
                    if (eventSubscribers.TryGetValue(flag, out var subscribers))
                    {
                        List<Func<object, UniTask>> safeSubscribers;
                        lock (subscribers)
                        {
                            // Create a copy to ensure thread safety while invoking
                            safeSubscribers = new List<Func<object, UniTask>>(subscribers);
                        }

                        // Invoke each subscriber asynchronously
                        foreach (var subscriber in safeSubscribers)
                        {
                            await subscriber(parameter);
                        }
                    }
                }
            }
        }

        /// <summary>
        /// Clear all event subscriptions. Useful for resetting the event system or cleaning up resources.
        /// </summary>
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
