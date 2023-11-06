using UnityEngine;

public class NPC : MonoBehaviour
{
    public NPCData npcData; // Data object holding NPC properties
    public NPCPoolManager poolManager; // Manager handling pooling of NPCs
    public NPCAbilities abilities; // Script managing NPC abilities

    private HealthBar healthBar;

    public int currentHealth;
    public Vector3 location;
    public bool isFriendly;



    protected virtual void Start()
    {
        abilities = GetComponent<NPCAbilities>(); // Initialize abilities
        currentHealth = npcData.maxHealth; // Set current health to max
        location = transform.position; // Store initial location

        CreateHealthBar(); // Create the health bar UI
    }

    protected virtual void Update()
    {
        location = transform.position;
    }

    public void ReceiveDamage(int damage)
    {
        currentHealth -= Mathf.Max(0, damage - npcData.defensePower); // Apply damage to NPC, considering defense power
        if (healthBar != null)
        {
            healthBar.SetHealth(currentHealth); // Update health bar UI
        }

        if (currentHealth <= 0)
        {
            Die(); // NPC dies if health reaches zero or below
        }
    }

    private void CreateHealthBar()
    {
        healthBar = gameObject.AddComponent<HealthBar>();
        healthBar.Initialize(npcData.maxHealth, npcData.npcName);

    }

    private void Die()
    {
        poolManager.ReturnToPool(this);
    }
}
