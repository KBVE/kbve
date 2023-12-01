using UnityEngine;

[CreateAssetMenu(fileName = "New Ability", menuName = "Ability System/Ability")]
public class Ability : ScriptableObject
{
    public string abilityName;
    public int manaCost;
    public Sprite icon;


    public virtual void Activate(Entity caster, GameObject target)
    {

    }

}
