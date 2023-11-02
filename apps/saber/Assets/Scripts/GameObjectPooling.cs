//!     [IMPORTS]
using UnityEngine;
using System.Collections.Generic;

[System.Serializable]
public class ObjectInfo
{
    public string prefabPath;
    public int initialPoolSize;
}

[System.Serializable]
public class ObjectSchema
{
    public ObjectInfo[] objects;
}

public class GameObjectPooling : MonoBehaviour
{
    public TextAsset jsonSchema;
    private Dictionary<string, Queue<GameObject>> poolDictionary = new Dictionary<string, Queue<GameObject>>();

    void Start()
    {
        ObjectSchema schema = JsonUtility.FromJson<ObjectSchema>(jsonSchema.text);
        foreach (var info in schema.objects)
        {
            CreatePool(info.prefabPath, info.initialPoolSize);
        }
    }

    void CreatePool(string prefabPath, int initialPoolSize)
    {
        Queue<GameObject> objectPool = new Queue<GameObject>();
        GameObject prefab = Resources.Load<GameObject>(prefabPath);
        for (int i = 0; i < initialPoolSize; i++)
        {
            GameObject obj = Instantiate(prefab);
            obj.SetActive(false);
            objectPool.Enqueue(obj);
        }
        poolDictionary.Add(prefabPath, objectPool);
    }

    public GameObject GetPooledObject(string prefabPath)
    {
        if (!poolDictionary.ContainsKey(prefabPath))
        {
            Debug.LogWarning("Pool does not exist.");
            return null;
        }

        if (poolDictionary[prefabPath].Count > 0)
        {
            GameObject obj = poolDictionary[prefabPath].Dequeue();
            obj.SetActive(true);
            return obj;
        }
        else
        {
            ExpandPool(prefabPath, 1);
            return GetPooledObject(prefabPath);
        }
    }

    void ExpandPool(string prefabPath, int amount)
    {
        GameObject prefab = Resources.Load<GameObject>(prefabPath);
        for (int i = 0; i < amount; i++)
        {
            GameObject obj = Instantiate(prefab);
            obj.SetActive(false);
            poolDictionary[prefabPath].Enqueue(obj);
        }
    }

    public void ReturnPooledObject(string prefabPath, GameObject obj)
    {
        obj.SetActive(false);
        ResetObject(obj);
        if (!poolDictionary.ContainsKey(prefabPath))
        {
            Debug.LogWarning("Pool does not exist.");
            return;
        }
        poolDictionary[prefabPath].Enqueue(obj);
    }

    void ResetObject(GameObject obj)
    {
        // Reset object properties as needed
        obj.transform.position = Vector3.zero;
        obj.transform.rotation = Quaternion.identity;
    }

    public void PrewarmPool(string prefabPath, int amount)
    {
        if (!poolDictionary.ContainsKey(prefabPath))
        {
            Debug.LogWarning("Pool does not exist.");
            return;
        }
        ExpandPool(prefabPath, amount);
    }
}
