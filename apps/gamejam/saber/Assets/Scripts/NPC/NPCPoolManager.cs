using System.Collections.Generic;
using UnityEngine;

public class NPCPoolManager : MonoBehaviour
{
    public GameObject npcPrefab;
    private List<NPC> npcPool = new List<NPC>();

    public NPC GetNPC(Vector3 position, Quaternion rotation)
    {
        foreach (NPC npc in npcPool)
        {
            if (!npc.gameObject.activeInHierarchy)
            {
                npc.transform.position = position;
                npc.transform.rotation = rotation;
                npc.gameObject.SetActive(true);
                return npc;
            }
        }

        GameObject newNpcObject = Instantiate(npcPrefab, position, rotation);
        NPC newNpc = newNpcObject.GetComponent<NPC>();
        newNpc.poolManager = this;
        npcPool.Add(newNpc);
        return newNpc;
    }

    public void ReturnToPool(NPC npc)
    {
        npc.gameObject.SetActive(false);
        npc.Health = npc.npcData.maxHealth;
        //! Removed npc.currentHealth = npc.npcData.maxHealth;  // Reset health based on NPCData
    }
}
