using UnityEngine;

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
}
