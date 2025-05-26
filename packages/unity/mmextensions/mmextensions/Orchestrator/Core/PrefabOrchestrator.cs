using System.Collections.Generic;
using UnityEngine;
using KBVE.MMExtensions.Orchestrator.Interfaces;
using Cysharp.Threading.Tasks;

namespace KBVE.MMExtensions.Orchestrator.Core
{
    public class PrefabOrchestrator : IPrefabOrchestrator
    {
        private readonly IAddressablePrefabLoader _loader;
        private readonly Transform _poolRoot;

        private readonly Dictionary<string, GameObjectPool> _pools = new();

        public PrefabOrchestrator(IAddressablePrefabLoader loader, Transform poolRoot)
        {
            _loader = loader;
            _poolRoot = poolRoot;
        }

        public async UniTask<GameObject> Spawn(string key, Vector3 position, Quaternion rotation)
        {
            if (!_pools.TryGetValue(key, out var pool))
            {
                var prefab = await _loader.LoadPrefabAsync(key);
                pool = new GameObjectPool(prefab, _poolRoot, initialSize: 4);
                _pools[key] = pool;
            }

            var instance = pool.Spawn(position, rotation);

            // Optionally call pooled initializer
            if (instance.TryGetComponent(out PooledHealth pooled))
            {
                pooled.InitializePool(key, this);
            }

            return instance;
        }

        public void Despawn(string key, GameObject instance)
        {
            if (_pools.TryGetValue(key, out var pool))
            {
                pool.Despawn(instance);
            }
            else
            {
                Object.Destroy(instance); // fallback
            }
        }
    }
}
