using System;
using System.Collections.Generic;
using UnityEngine;

namespace KBVE.Services
{
    public class Services : MonoBehaviour
    {
        private static Services _instance;
        public static Services Instance
        {
            get
            {
                if (_instance == null)
                {
                    var servicesGameObject = new GameObject("Services");
                    _instance = servicesGameObject.AddComponent<Services>();
                    DontDestroyOnLoad(servicesGameObject);
                }
                return _instance;
            }
        }

        private Dictionary<Type, object> _services = new Dictionary<Type, object>();
        private Dictionary<Type, Queue<object>> _pools = new Dictionary<Type, Queue<object>>();

        public void RegisterService<T>(T service) where T : class
        {
            if (service == null) throw new ArgumentNullException(nameof(service));
            _services[typeof(T)] = service;
        }

        public T GetService<T>() where T : class
        {
            if (_services.TryGetValue(typeof(T), out var service))
            {
                return service as T;
            }
            Debug.LogWarning($"Service of type {typeof(T).Name} not found.");
            return null;
        }

        public void ShutdownService<T>() where T : class
        {
            if (_services.TryGetValue(typeof(T), out var service))
            {
                if (service is ICleanable cleanableService)
                {
                    cleanableService.Cleanup();
                }

                _services.Remove(typeof(T));
            }
            else
            {
                Debug.LogWarning($"Attempted to shutdown non-existent service of type {typeof(T).Name}.");
            }
        }

        public T GetPooledObject<T>() where T : new()
        {
            if (_pools.TryGetValue(typeof(T), out var queue) && queue.Count > 0)
            {
                return (T)queue.Dequeue();
            }
            return new T();
        }

        public void ReturnPooledObject<T>(T obj)
        {
            if (obj == null)
            {
                Debug.LogWarning("Attempted to return a null object to the pool.");
                return;
            }

            var type = typeof(T);
            if (!_pools.ContainsKey(type))
            {
                _pools[type] = new Queue<object>();
            }
            _pools[type].Enqueue(obj);
        }

        public void ShutdownPool<T>()
        {
            if (_pools.TryGetValue(typeof(T), out var queue))
            {
                while (queue.Count > 0)
                {
                    var obj = queue.Dequeue();
                    if (obj is UnityEngine.Object unityObj)
                    {
                        Destroy(unityObj);
                    }
                    else if (obj is ICleanable cleanable)
                    {
                        cleanable.Cleanup();
                    }
                }

                _pools.Remove(typeof(T));
            }
            else
            {
                Debug.LogWarning($"Attempted to shutdown non-existent pool for type {typeof(T).Name}.");
            }
        }

        public interface ICleanable
        {
            void Cleanup();
        }
    }
}
