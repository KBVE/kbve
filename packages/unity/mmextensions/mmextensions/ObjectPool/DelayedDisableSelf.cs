using System;
using Cysharp.Threading.Tasks;
using UnityEngine;

public class DelayedDisableSelf : MonoBehaviour
{
  public int delayMillis;

  // Start is called once before the first execution of Update after the MonoBehaviour is created
  void OnEnable()
  {
    DoAfterSeconds(delayMillis, () => gameObject.SetActive(false));
  }

  private async UniTask DoAfterSeconds(int millisDelay, Action action)
  {
    await UniTask.Delay(millisDelay);

    action.Invoke();
  }
}
