using System;
using System.Collections;
using System.Collections.Generic;
using Cysharp.Threading.Tasks;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using UnityEngine;
using UnityEngine.Pool;
using UnityEngine.Serialization;
using UnityEngine.Tilemaps;

namespace KBVE.MMExtensions.ObjectPool
{
  public class NetworkObjectPool : MMMultipleObjectPooler, MMEventListener<TopDownEngineEvent>
  {
    // Dictionary to manage additional prefab pools at runtime
    private readonly Dictionary<GameObject, ObjectPool<GameObject>> _runtimePools = new();

    /// <summary>
    /// Dynamically registers a prefab to the pool and creates its object pool.
    /// </summary>
    /// <param name="prefab">The prefab to register.</param>
    /// <param name="poolSize">Initial size of the pool.</param>
    public void RegisterPrefab(GameObject prefab, int poolSize)
    {
      // Check if prefab is already registered
      if (GetPoolObject(prefab) != null)
      {
        Debug.LogWarning($"Prefab {prefab.name} is already registered in MMMultipleObjectPooler.");
        return;
      }

      // Create and add to runtime pool
      var poolerObject = new MMMultipleObjectPoolerObject
      {
        GameObjectToPool = prefab,
        PoolSize = poolSize,
        PoolCanExpand = true,
        Enabled = true
      };

      Pool.Add(poolerObject);

      for (int i = 0; i < poolSize; i++)
      {
        AddOneObjectToThePool(prefab);
      }

      Debug.Log($"Registered prefab {prefab.name} with a pool size of {poolSize}.");
    }

    /// <summary>
    /// Dynamically removes a prefab from the pool and destroys its pooled objects.
    /// </summary>
    /// <param name="prefab">The prefab to unregister.</param>
    public void UnregisterPrefab(GameObject prefab)
    {
      var poolerObject = GetPoolObject(prefab);
      if (poolerObject == null)
      {
        Debug.LogWarning($"Prefab {prefab.name} is not registered in MMMultipleObjectPooler.");
        return;
      }

      // Remove objects from pool and clear their references
      Pool.Remove(poolerObject);
      var objectsToRemove = _objectPool.PooledGameObjects.FindAll(obj => obj.name == prefab.name);

      foreach (var obj in objectsToRemove)
      {
        Destroy(obj); // Destroy the game object
        _objectPool.PooledGameObjects.Remove(obj); // Remove it from the pool
      }

      Debug.Log($"Unregistered prefab {prefab.name} and cleared its pool.");
    }

    /// <summary>
    /// Gets a networked object from the pool for the given prefab.
    /// </summary>
    /// <param name="prefab">The prefab to get an object for.</param>
    /// <param name="position">Position to set for the object.</param>
    /// <param name="rotation">Rotation to set for the object.</param>
    /// <returns>The retrieved game object.</returns>
    public GameObject GetNetworkObject(GameObject prefab, Vector3 position, Quaternion rotation)
    {
      var pooledObject = GetPooledGameObjectOfType(prefab.name);
      if (pooledObject == null)
      {
        Debug.LogWarning(
          $"No available objects in pool for prefab {prefab.name}. Expanding pool..."
        );
        var poolerObject = GetPoolObject(prefab);
        if (poolerObject != null && poolerObject.PoolCanExpand)
        {
          pooledObject = AddOneObjectToThePool(prefab);
        }
      }

      if (pooledObject != null)
      {
        pooledObject.transform.SetPositionAndRotation(position, rotation);
        pooledObject.SetActive(true);
      }
      return pooledObject;
    }

    /// <summary>
    /// Returns a networked object back to the pool.
    /// </summary>
    /// <param name="gameObject">The object to return.</param>
    public void ReturnNetworkObject(GameObject gameObject)
    {
      gameObject.SetActive(false);
      _objectPool.PooledGameObjects.Add(gameObject);
    }

    /// <summary>
    /// Called when the object is destroyed.
    /// </summary>
    private void OnDestroy()
    {
      // Cleanup additional runtime pools if any
      foreach (var runtimePool in _runtimePools.Values)
      {
        runtimePool.Clear();
      }
      _runtimePools.Clear();

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
