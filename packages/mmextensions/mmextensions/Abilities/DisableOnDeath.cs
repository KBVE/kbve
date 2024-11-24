using UnityEngine;
using MoreMountains.TopDownEngine;
using Cysharp.Threading.Tasks;
using System;

public class DisableOnDeath : MonoBehaviour
{
    [SerializeField] Health health;

    private void Start()
    {
        if(health == null) health = GetComponent<Health>();
    }

    private void OnEnable()
    {
        health.OnDeath += Health_OnDeath;
    }

    private void OnDisable()
    {
        health.OnDeath -= Health_OnDeath;
    }
    
    private void Health_OnDeath()
    {
        OnDeathDisableAsync();
    }

    private async UniTask OnDeathDisableAsync()
    {
        await UniTask.Delay(500, DelayType.DeltaTime);
        
        gameObject.SetActive(false);
    }
}
