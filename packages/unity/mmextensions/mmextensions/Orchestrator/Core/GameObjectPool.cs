using System.Collections.Generic;
using KBVE.MMExtensions.Orchestrator.Interfaces;
using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.Core
{
    public class GameObjectPool
    {
        private readonly GameObject _prefab;
        private readonly Stack<GameObject> _pool = new();
        private readonly Transform _parent;

        public GameObjectPool(GameObject prefab, Transform parent, int initialSize = 5)
        {
            _prefab = prefab;
            _parent = parent;

            for (int i = 0; i < initialSize; i++)
            {
                _pool.Push(CreateInstance());
            }
        }

        private GameObject CreateInstance()
        {
            var instance = UnityEngine.Object.Instantiate(_prefab, _parent);
            instance.SetActive(false);
            return instance;
        }

        public GameObject Spawn(Vector3 position, Quaternion rotation)
        {
            var instance = _pool.Count > 0 ? _pool.Pop() : CreateInstance();
            instance.transform.SetPositionAndRotation(position, rotation);
            instance.SetActive(true);

            if (instance.TryGetComponent<IPoolable>(out var poolable))
            {
                poolable.OnSpawn();
            }

            return instance;
        }

        public void Despawn(GameObject instance)
        {
            if (instance.TryGetComponent<IPoolable>(out var poolable))
            {
                poolable.OnDespawn();
            }

            instance.SetActive(false);
            instance.transform.SetParent(_parent); // Reset to pool root
            _pool.Push(instance);
        }
    }
}
