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
            Queue<GameObject> objectPool = new Queue<GameObject>();
            GameObject prefab = Resources.Load<GameObject>(info.prefabPath);
            for (int i = 0; i < info.initialPoolSize; i++)
            {
                GameObject obj = Instantiate(prefab);
                obj.SetActive(false);
                objectPool.Enqueue(obj);
            }
            poolDictionary.Add(info.prefabPath, objectPool);
        }
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
            GameObject prefab = Resources.Load<GameObject>(prefabPath);
            GameObject obj = Instantiate(prefab);
            return obj;
        }
    }

    public void ReturnPooledObject(string prefabPath, GameObject obj)
    {
        obj.SetActive(false);
        if (!poolDictionary.ContainsKey(prefabPath))
        {
            Debug.LogWarning("Pool does not exist.");
            return;
        }
        poolDictionary[prefabPath].Enqueue(obj);
    }
}
