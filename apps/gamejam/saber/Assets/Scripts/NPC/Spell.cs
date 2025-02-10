using UnityEngine;

[CreateAssetMenu(fileName = "New Spell", menuName = "Abilities/Spell")]
public class Spell : ScriptableObject
{
    public string spellName;
    public float damage;
    public float manaCost;
    public float castTime;
    public float cooldown;
    //public GameObject spellEffectPrefab; // The visual effect prefab of the spell
    public Sprite spellSprite; // Assign this in the inspector

    // This method would be called to activate the spell effect
    public virtual void Cast(GameObject caster, GameObject target, Camera mainCamera)
      {
            // Check if the caster, target, and mainCamera are not null
            if (caster == null)
            {
                Debug.LogError("Caster is null.");
                return;
            }

            if (target == null)
            {
                Debug.LogError("Target is null.");
                return;
            }
            if (mainCamera == null)
            {
                Debug.LogError("Main Camera is null.");
                return;
            }

        // Check if the spell's sprite is assigned
        if (spellSprite != null)
        {
            // Create a new GameObject to hold the spell effect
            GameObject spellEffectObject = new GameObject(spellName + " Effect");
            spellEffectObject.transform.position = target.transform.position; // Position it at the target's location

            // Add a SpriteRenderer and assign the sprite to it
            SpriteRenderer spriteRenderer = spellEffectObject.AddComponent<SpriteRenderer>();
            spriteRenderer.sprite = spellSprite;

            // Make the sprite face the camera using the Billboard script
            Billboard billboardComponent = spellEffectObject.AddComponent<Billboard>();
            billboardComponent.SetCamera(mainCamera);
        }
        else
        {
            // Log an error if the sprite is not assigned
            Debug.LogError("Spell sprite is not assigned.");
        }
    }
}
