using UnityEngine;

public class NPC : MonoBehaviour
{
    public NPCData npcData;

    public int currentHealth;
    public Vector3 location;
    public bool isFriendly;
    public NPCPoolManager poolManager;

    protected virtual void Start()
    {
        currentHealth = npcData.maxHealth;
        location = transform.position;
    }

    protected virtual void Update()
    {
        location = transform.position;
    }

    public void ReceiveDamage(int damage)
    {
        currentHealth -= Mathf.Max(0, damage - npcData.defensePower);
        if (currentHealth <= 0)
        {
            Die();
        }
    }

    private void Die()
    {
        poolManager.ReturnToPool(this);
    }
}
