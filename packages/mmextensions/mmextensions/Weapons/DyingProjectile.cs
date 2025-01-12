using MoreMountains.TopDownEngine;

namespace KBVE.MMExtensions.Weapons
{
  public class DyingProjectile : Projectile
  {
    public Health health;

    public override void Destroy()
    {
      if (health.CurrentHealth > 0)
      {
        health.Kill();
      }
      base.Destroy();
    }
  }
}
