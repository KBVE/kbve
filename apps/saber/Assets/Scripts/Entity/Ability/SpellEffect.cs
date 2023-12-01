using UnityEngine;

public class SpellEffect : MonoBehaviour
{
    private int damageAmount;
    private float duration;

    // This part of the SpellEffect has to be optimized again!
    // We do not want to Destroy the object but rather return it into a <Pool>
    public void Initialize(int damage, float dur)
    {
        damageAmount = damage;
        duration = dur;
        Destroy(gameObject, duration); // Automatically destroy the spell effect after its duration
    }

    void OnTriggerEnter(Collider other)
    {
        Entity entity = other.GetComponent<Entity>();
        if (entity != null)
        {
            entity.TakeDamage(damageAmount); // Apply damage
        }
    }
}
