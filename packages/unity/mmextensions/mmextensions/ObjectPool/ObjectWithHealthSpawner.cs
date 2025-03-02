using MoreMountains.TopDownEngine;
using UnityEngine;

namespace KBVE.MMExtensions.ObjectPool
{
  public class ObjectWithHealthSpawner : ObjectSpawner
  {
    protected override void SetupPooledObject(GameObject gameObject)
    {
      base.SetupPooledObject(gameObject);
      gameObject.GetComponent<Health>().Revive();
    }
  }
}
