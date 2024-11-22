using System;
using System.Collections.Generic;
using UnityEngine;
using Cysharp.Threading.Tasks;
using KBVE.Kilonet.Objects;
using KBVE.Kilonet.Utils;

namespace KBVE.Kilonet.Managers
{
    public class KilonetManager : MonoBehaviour
    {
        public static KilonetManager Instance { get; private set; }

        private Dictionary<byte[], KilonetObject> kilonetObjects;

        private void Awake()
        {
            if (Instance == null)
            {
                Instance = this;
                kilonetObjects = new Dictionary<byte[], KilonetObject>(new ByteArrayComparer());
            }
            else
            {
                Destroy(gameObject);
            }
        }

        public void Register(KilonetObject obj)
        {
            if (!kilonetObjects.ContainsKey(obj.ULID))
            {
                kilonetObjects.Add(obj.ULID, obj);
            }
        }

        public void Unregister(KilonetObject obj)
        {
            if (kilonetObjects.ContainsKey(obj.ULID))
            {
                kilonetObjects.Remove(obj.ULID);
            }
        }

        public KilonetObject GetKilonetObject(byte[] ulid)
        {
            return kilonetObjects.TryGetValue(ulid, out var obj) ? obj : null;
        }

        public async UniTask RemoveAllObjectsAsync()
        {
            await UniTask.Yield();
            kilonetObjects.Clear();
        }

        public KilonetObject SpawnObject(byte[] ulid, GameObject prefab, Vector3 position, Quaternion rotation)
        {
            GameObject newObject = Instantiate(prefab, position, rotation);

            KilonetObject kilonetObject = newObject.GetComponent<KilonetObject>();
            if (kilonetObject == null)
            {
                Debug.LogError("Prefab does not contain a KilonetObject component!");
                Destroy(newObject);
                return null;
            }

            kilonetObject.ULID = ulid;
            Register(kilonetObject);

            Debug.Log($"Spawned KilonetObject with ULID: {BitConverter.ToString(ulid)}");
            return kilonetObject;
        }

        public void DestroyObject(byte[] ulid)
        {
            KilonetObject kilonetObject = GetKilonetObject(ulid);
            if (kilonetObject != null)
            {
                Unregister(kilonetObject);
                Destroy(kilonetObject.gameObject);
                Debug.Log($"Destroyed KilonetObject with ULID: {BitConverter.ToString(ulid)}");
            }
            else
            {
                Debug.LogWarning($"No KilonetObject found with ULID: {BitConverter.ToString(ulid)}");
            }
        }
    }
}