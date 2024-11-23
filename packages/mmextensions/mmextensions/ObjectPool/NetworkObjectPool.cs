using System;
using System.Collections;
using System.Collections.Generic;
using Cysharp.Threading.Tasks;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using UnityEngine;
using UnityEngine.Serialization;
using UnityEngine.Tilemaps;

namespace KBVE.MMExtensions.ObjectPool
{
  public class NetworkObjectPool : MMMultipleObjectPooler, MMEventListener<TopDownEngineEvent>
  {
    /// <summary>
    /// Called when the object is destroyed.
    /// </summary>
    private void OnDestroy()
    {
      Debug.Log("NetworkObjectPool is being destroyed!");
      Owner?.Remove(this);
    }

    protected virtual void OnEnable()
    {
      this.MMEventStartListening<TopDownEngineEvent>();
    }

    protected virtual void OnDisable()
    {
      this.MMEventStopListening<TopDownEngineEvent>();
    }

    public virtual void OnMMEvent(TopDownEngineEvent topDownEngineEvent)
    {
      switch (topDownEngineEvent.EventType)
      {
        case TopDownEngineEventTypes.SpawnComplete:
          Debug.Log("[NetworkObjectPool] TopDownEngineEventTypes.SpawnComplete");
          break;

        default:
          Debug.Log($"[NetworkObjectPool] Unhandled event type: {topDownEngineEvent.EventType}");
          break;
      }
    }
  }
}
