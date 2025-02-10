using System.Collections.Generic;
using KBVE.Entity;
using UnityEngine;

namespace KBVE.Services
{
  public interface IEntityService
  {
    GameObject SpawnEntity(GameObject prefab, Vector3 position, Quaternion rotation);
    void DespawnEntity(GameObject entity, GameObject prefab);
    void PrepopulatePool(GameObject prefab, int count);
    void ClearPool(GameObject prefab);
  }

  public class EntityService : MonoBehaviour, IEntityService
  {
    public static EntityService Instance { get; private set; }

    private Dictionary<GameObject, Queue<GameObject>> entityPools =
      new Dictionary<GameObject, Queue<GameObject>>();

    private void Awake()
    {
      if (Instance != null && Instance != this)
      {
        Destroy(gameObject);
      }
      else
      {
        Instance = this;
        DontDestroyOnLoad(gameObject);
      }
    }

    public GameObject SpawnEntity(GameObject prefab, Vector3 position, Quaternion rotation)
    {
      GameObject entity = null;
      if (entityPools.TryGetValue(prefab, out Queue<GameObject> pool) && pool.Count > 0)
      {
        entity = pool.Dequeue();
        entity.transform.position = position;
        entity.transform.rotation = rotation;
        entity.SetActive(true);
      }
      else
      {
        entity = Instantiate(prefab, position, rotation);
      }
      entity.GetComponent<IPoolable>()?.ResetComponent();
      return entity;
    }

    public void DespawnEntity(GameObject entity, GameObject prefab)
    {
      if (!entityPools.ContainsKey(prefab))
      {
        entityPools[prefab] = new Queue<GameObject>();
      }

      entityPools[prefab].Enqueue(entity);
      entity.SetActive(false);

      entity.GetComponent<IPoolable>()?.ResetComponent();
    }

    public void PrepopulatePool(GameObject prefab, int count)
    {
      if (!entityPools.ContainsKey(prefab))
      {
        entityPools[prefab] = new Queue<GameObject>();
      }

      for (int i = 0; i < count; i++)
      {
        GameObject newEntity = Instantiate(prefab);
        newEntity.SetActive(false);
        entityPools[prefab].Enqueue(newEntity);
        newEntity.GetComponent<IPoolable>()?.ResetComponent();
      }
    }

    public void ClearPool(GameObject prefab)
    {
      if (entityPools.TryGetValue(prefab, out Queue<GameObject> pool))
      {
        while (pool.Count > 0)
        {
          GameObject entity = pool.Dequeue();
          Destroy(entity);
        }

        entityPools.Remove(prefab);
      }
    }
  }
}
