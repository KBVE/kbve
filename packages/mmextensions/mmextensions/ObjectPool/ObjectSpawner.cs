// using Cysharp.Threading.Tasks;
// using MoreMountains.Tools;
// using MoreMountains.TopDownEngine;
using UnityEngine;

namespace KBVE.MMExtensions.ObjectPool
{
  public class ObjectSpawner : MonoBehaviour
  {
    [SerializeField] private NetworkObjectPool networkObjectPool;
    [SerializeField] private Transform spawnLocation;

    private void Start()
    {
        networkObjectPool.FillObjectPool();

        GameObject gameObject = networkObjectPool.GetPooledGameObject();
        gameObject.transform.position = spawnLocation.position;
        gameObject.SetActive(true);
    }
  }
}