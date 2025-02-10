using UnityEngine;

[CreateAssetMenu(fileName = "New Heal Ability", menuName = "Ability System/Heal Ability")]
public class HealAbility : Ability
{
    public int healAmount;

    public override void Activate(Entity caster, GameObject target)
    {
        if (caster.Mana >= manaCost && target != null)
        {
            Entity targetEntity = target.GetComponent<Entity>();
            if (targetEntity != null)
            {
                targetEntity.Heal(healAmount);
                caster.UseMana(manaCost);
            }
        }
    }
}
