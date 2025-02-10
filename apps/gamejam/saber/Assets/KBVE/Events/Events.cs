using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace KBVE.Events
{
  public interface IGameEvent
  {
    void Trigger();
  }

  public static class EventUtils
  {
    public static void LogEventTrigger(string eventName)
    {
      Debug.Log($"Event Triggered: {eventName}");
    }
  }

  public class GameEventArgs : EventArgs { }

  public class EventAggregator
  {
    private readonly Dictionary<Type, List<Delegate>> eventSubscribers = new();

    public void Subscribe<TEvent>(Action<TEvent> handler)
      where TEvent : IGameEvent
    {
      if (!eventSubscribers.ContainsKey(typeof(TEvent)))
      {
        eventSubscribers[typeof(TEvent)] = new List<Delegate>();
      }
      eventSubscribers[typeof(TEvent)].Add(handler);
    }

    public void Publish<TEvent>(TEvent eventToPublish)
      where TEvent : IGameEvent
    {
      if (eventSubscribers.ContainsKey(typeof(TEvent)))
      {
        foreach (var handler in eventSubscribers[typeof(TEvent)].Cast<Action<TEvent>>())
        {
          handler(eventToPublish);
        }
      }
    }
  }

  public static class EventExtensions
  {
    public static void SafeInvoke<T>(this Action<T> action, T param)
    {
      action?.Invoke(param);
    }
  }

  public class EventQueue
  {
    private Queue<IGameEvent> eventQueue = new();

    public void EnqueueEvent(IGameEvent gameEvent)
    {
      eventQueue.Enqueue(gameEvent);
    }

    public void ProcessEvents()
    {
      while (eventQueue.Count > 0)
      {
        var gameEvent = eventQueue.Dequeue();
        gameEvent.Trigger();
      }
    }
  }
}
