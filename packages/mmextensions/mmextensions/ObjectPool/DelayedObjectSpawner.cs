using System;
using Cysharp.Threading.Tasks;
using KBVE.MMExtensions.ObjectPool;
using MoreMountains.Tools;
using UnityEngine;

public class DelayedObjectSpawner : MonoBehaviour
{
  public MMObjectPooler objectPool;
  public int millisToWait;

  // Start is called once before the first execution of Update after the MonoBehaviour is created
  void OnEnable()
  {
    DoAfterSeconds(millisToWait, () => SetupPooledObject(objectPool.GetPooledGameObject()));
  }

  private async UniTask DoAfterSeconds(int millisDelay, Action action)
  {
    Debug.Log("a");
    await UniTask.Delay(millisDelay);
    Debug.Log("b");

    action.Invoke();
  }

  private void SetupPooledObject(GameObject pooledGameObject)
  {
    pooledGameObject.SetActive(true);
    pooledGameObject.transform.position = gameObject.transform.position;
    pooledGameObject.transform.rotation = Quaternion.identity;
  }
}
