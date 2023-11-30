using UnityEngine;

//** Going to remove this and just place it into the Entity.cs

public class EntityAbilities
{
  private Entity _owner;

  public Entity Owner
  {
    get { return _owner; }
    set
    {
      _owner = value;
    }
  }

  public EntityAbilities(Entity owner)
  {
    this.Owner = owner;
  }
  public void UseAbility(string abilityName)
    {
        // Ability logic here
        // You can access the owner's properties like Owner.Mana
    }

}
