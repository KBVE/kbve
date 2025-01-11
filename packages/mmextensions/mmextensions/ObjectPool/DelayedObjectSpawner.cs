using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using KBVE.MMExtensions.ObjectPool;
using MoreMountains.Tools;
using UnityEngine;

public class DelayedObjectSpawner : MonoBehaviour
{
  public MMObjectPooler objectPool;
  public int millisToWait;
  private CancellationTokenSource cancellationTokenSource;

  // Start is called once before the first execution of Update after the MonoBehaviour is created
  void OnEnable()
  {
    cancellationTokenSource = new CancellationTokenSource();
    DoAfterSeconds(
      millisToWait,
      () => SetupPooledObject(objectPool.GetPooledGameObject()),
      cancellationTokenSource.Token
    );
  }

  void OnDisable()
  {
    cancellationTokenSource?.Cancel();
    cancellationTokenSource?.Dispose();
  }

  private async UniTask DoAfterSeconds(
    int millisDelay,
    Action action,
    CancellationToken cancellationToken
  )
  {
    try
    {
      await UniTask.Delay(millisDelay, cancellationToken: cancellationToken);
      if (!cancellationToken.IsCancellationRequested)
      {
        action.Invoke();
      }
    }
    catch (OperationCanceledException e)
    {
      Debug.Log("operation canceled exception: " + e.Message);
    }
  }

  private void SetupPooledObject(GameObject pooledGameObject)
  {
    pooledGameObject.SetActive(true);
    pooledGameObject.transform.position = gameObject.transform.position;
    pooledGameObject.transform.rotation = Quaternion.identity;
  }
}
