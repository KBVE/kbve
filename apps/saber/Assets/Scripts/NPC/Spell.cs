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
    public virtual void Cast(GameObject caster, GameObject target, Camera mainCamera)
    {
        // Ensure the spellEffectPrefab is not null and is assigned.
        if (spellEffectPrefab != null)
        {
            // Instantiate the spell effect and store the reference in a local variable
            GameObject spellEffectInstance = Instantiate(spellEffectPrefab, target.transform.position, Quaternion.identity);

            // If there's an error here, ensure your prefab has the Billboard component attached.
            Billboard billboardComponent = spellEffectInstance.GetComponent<Billboard>();
            if (billboardComponent != null)
            {
                billboardComponent.SetCamera(mainCamera);
            }
            else
            {
                // If you hit this error, then your spellEffectPrefab does not have a Billboard component.
                Debug.LogError("Billboard component not found on the spell effect prefab!");
            }
        }
        else
        {
            // If you hit this error, then the spellEffectPrefab was not assigned.
            Debug.LogError("Spell effect prefab is not assigned!");
        }
    }
}
