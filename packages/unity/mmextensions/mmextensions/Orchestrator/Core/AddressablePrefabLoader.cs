using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;
using KBVE.MMExtensions.Orchestrator.Interfaces;
using Cysharp.Threading.Tasks;

namespace KBVE.MMExtensions.Orchestrator.Core
{
    public class AddressablePrefabLoader : IAddressablePrefabLoader
    {
        private readonly Dictionary<string, GameObject> _cache = new();

        public async UniTask<GameObject> LoadPrefabAsync(string key)
        {
            if (_cache.TryGetValue(key, out var prefab))
            {
                return prefab;
            }

            AsyncOperationHandle<GameObject> handle = Addressables.LoadAssetAsync<GameObject>(key);
            await handle.ToUniTask();

            if (handle.Status != AsyncOperationStatus.Succeeded)
            {
                Debug.LogError($"[AddressablePrefabLoader] Failed to load prefab for key: {key}");
                return null;
            }

            prefab = handle.Result;
            _cache[key] = prefab;
            return prefab;
        }
    }
}