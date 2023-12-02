using UnityEngine;

[CreateAssetMenu(fileName = "New Spell Ability", menuName = "Ability System/Spell Ability")]
public class SpellAbility : Ability
{
    public GameObject spellPrefab; // The prefab for the spell effect
    public int damageAmount;
    public float duration; // How long the spell effect lasts
      public float radius; // Add this line


    public override void Activate(Entity caster, GameObject target)
    {
        if (caster.Mana >= manaCost)
        {
            Vector3 spawnPosition = target != null ? target.transform.position : caster.transform.position;
            GameObject spellEffect = Instantiate(spellPrefab, spawnPosition, Quaternion.identity);
            SpellHex effectComponent = spellEffect.AddComponent<SpellHex>();
            effectComponent.Initialize(caster, damageAmount, duration, radius); // Pass radius here
            caster.UseMana(manaCost);
        }
    }
}
