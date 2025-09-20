using UnityEngine;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;

namespace KBVE.MMExtensions.Actions
{
  [AddComponentMenu("KBVE/MMExtensions/Actions/AI Action Shoot 2D KBVE")]
  public class AIActionShoot2DKBVE : AIActionShoot2D
  {
    public override void Initialization()
    {
      if(!ShouldInitialize) return;
      base.Initialization();
      if (TargetHandleWeaponAbility.CurrentWeapon != null)
      {
        _weaponAim = TargetHandleWeaponAbility.CurrentWeapon.gameObject.MMGetComponentNoAlloc<WeaponAim>();
        _projectileWeapon = TargetHandleWeaponAbility.CurrentWeapon.gameObject.MMGetComponentNoAlloc<ProjectileWeapon>();
      }
    }
  }
}
