using MoreMountains.Tools;
using MoreMountains.TopDownEngine;

namespace KBVE.MMExtensions.Ai
{
    public class AiActionChangeWeaponAim : AIAction
    {
        public CharacterHandleWeapon handleWeapon;
        private WeaponAim.AimControls targetAimControl = WeaponAim.AimControls.SecondaryMovement;

        public override void PerformAction()
        {
            handleWeapon.ForceWeaponAimControl = true;
            handleWeapon.ForcedWeaponAimControl = targetAimControl;
        }
    }
}
