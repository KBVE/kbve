using UnityEngine;

public class SpellHex : MonoBehaviour
{
    private float radius; // Radius of the AoE
    public float duration; // Duration of the effect
    public LayerMask affectedLayers; // Layers affected by the spell
    private int damageAmount;
    public float damageInterval = 1f; // Interval in seconds to apply damage
    private float lastDamageTime;

    public void Initialize(int damage, float dur, float rad)
    {
        damageAmount = damage;
        duration = dur;
        radius = rad;

        SetupEffectArea();
        Destroy(gameObject, duration); // Automatically destroy the spell effect after its duration
    }

    private void SetupEffectArea()
    {
        SphereCollider collider = gameObject.AddComponent<SphereCollider>();
        collider.isTrigger = true;
        collider.radius = radius;
    }

    void OnTriggerEnter(Collider other)
    {
        ApplyEffect(other);
    }

    void OnTriggerStay(Collider other)
    {
        // Check if enough time has passed since the last damage application
        if (Time.time > lastDamageTime + damageInterval)
        {
            ApplyEffect(other);
            lastDamageTime = Time.time; // Update last damage time
        }
    }

    void OnTriggerExit(Collider other)
    {
        // You can add any final effects when the entity leaves the AoE
        // For example, removing a debuff or stopping a visual effect
    }

    private void ApplyEffect(Collider other)
    {
        // Check if the collider's layer is in the affectedLayers
        if (((1 << other.gameObject.layer) & affectedLayers) != 0)
        {
            Entity entity = other.GetComponent<Entity>();
            if (entity != null)
            {
                entity.TakeDamage(damageAmount); // Apply damage
            }
        }
    }
}
