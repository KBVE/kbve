using UnityEngine;

[CreateAssetMenu(fileName = "New Spell", menuName = "Abilities/Spell")]
public class Spell : ScriptableObject
{
    public string spellName;
    public float damage;
    public float manaCost;
    public float castTime;
    public float cooldown;
    public GameObject spellEffectPrefab; // The visual effect prefab of the spell

    // This method would be called to activate the spell effect
    public virtual void Cast(GameObject caster, GameObject target)
    {
        // Instantiate spell effect, apply damage or other effects to the target
        if (spellEffectPrefab != null)
        {
            Instantiate(spellEffectPrefab, target.transform.position, Quaternion.identity);
        }
    }
}
