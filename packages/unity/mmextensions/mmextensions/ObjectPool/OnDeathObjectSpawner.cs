using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using UnityEngine;

namespace KBVE.MMExtensions.ObjectPool
{
  public class OnDeathObjectSpawner : MonoBehaviour
  {
    public Health health;
    public MMObjectPooler objectPool;

    // Start is called once before the first execution of Update after the MonoBehaviour is created
    void OnEnable()
    {
      health.OnDeath += Health_OnDeath;
    }

    void OnDisable()
    {
      health.OnDeath -= Health_OnDeath;
    }

    private void Health_OnDeath()
    {
      SetupPooledObject(objectPool.GetPooledGameObject());
    }

    private void SetupPooledObject(GameObject pooledGameObject)
    {
      pooledGameObject.SetActive(true);
      pooledGameObject.transform.position = gameObject.transform.position;
      pooledGameObject.transform.rotation = Quaternion.identity;
    }
  }
}
