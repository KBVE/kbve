using UnityEngine;

public class SpellEffect : MonoBehaviour
{
    private Spell spellData; // Reference to the Spell.

    public void Initialize(Spell spell)
    {
        spellData = spell;
    }

    private void OnTriggerEnter(Collider other)
    {
        if (other.CompareTag("Player") && spellData != null)
        {
             Debug.Log("[Entity] -> Player -> Take Damage!");
            // Access the damage from the spellData ScriptableObject
            PlayerHealth playerHealth = other.GetComponent<PlayerHealth>();
            if (playerHealth != null)
            {
                playerHealth.DamagePlayer((int) spellData.damage);
            }
        }
    }
}
