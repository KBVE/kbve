// using Cysharp.Threading.Tasks;
// using MoreMountains.Tools;
// using MoreMountains.TopDownEngine;
using UnityEngine;

namespace KBVE.MMExtensions.ObjectPool
{
  public class ObjectSpawner : MonoBehaviour
  {
    [SerializeField]
    private NetworkObjectPool networkObjectPool;

    [SerializeField]
    private Transform spawnLocation;

    [SerializeField]
    private int objectsToSpawn;

    [SerializeField]
    private bool spawnOnStart;

    //private Dictionary<GameObject, string> spawnedObjects = new Dictionary<GameObject, string>();


    protected virtual void Start()
    {
      if (spawnOnStart)
        Spawn();
    }

    public virtual void Spawn()
    {
      // networkObjectPool.FillObjectPool();
      for (int i = 0; i < objectsToSpawn; i++)
      {
        GameObject gameObject = networkObjectPool.GetPooledGameObject();
        SetupPooledObject(gameObject);
        gameObject.SetActive(true);
      }
    }

    protected virtual void SetupPooledObject(GameObject gameObject)
    {
      gameObject.transform.position = spawnLocation.position;
    }

    // // Check if a GameObject is in the pool
    // public bool IsObjectInPool(GameObject gameObject)
    // {
    //     return spawnedObjects.ContainsKey(gameObject);
    // }

    // // Get the unique identifier for a GameObject
    // public string GetObjectIdentifier(GameObject gameObject)
    // {
    //     if (spawnedObjects.TryGetValue(gameObject, out var uniqueId))
    //     {
    //         return uniqueId;
    //     }
    //     return null; // Return null if the object isn't tracked
    // }

    // // Remove the GameObject from the hash when it's no longer in use
    // public void RemoveFromPool(GameObject gameObject)
    // {
    //     if (spawnedObjects.ContainsKey(gameObject))
    //     {
    //         spawnedObjects.Remove(gameObject);
    //     }
    // }
  }
}
