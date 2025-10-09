using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;

namespace KBVE.MMExtensions.Abilities
{
  /// <summary>
  /// Add this ability to a character and it'll rotate or flip to face the direction of movement or the weapon's, or both, or none
  /// Only add this ability to a 2D character
  /// </summary>
  [AddComponentMenu("KBVE/MMExtensions/Abilities/Character Orientation 2D KBVE")]
  public class CharacterOrientation2DKBVE : CharacterOrientation2D
  {
    protected float _lastWeaponAngle;

    /// <summary>
    /// Flips the character to face the current weapon direction
    /// </summary>
    protected override void FlipToFaceWeaponDirection()
    {
      if (_characterHandleWeapon == null)
      {
        return;
      }
      // if we're not supposed to face our direction, we do nothing and exit
      if ((FacingMode != FacingModes.WeaponDirection) && (FacingMode != FacingModes.Both)) { return; }

      if (_characterHandleWeapon.WeaponAimComponent != null)
      {
        switch (FacingBase)
        {
          case FacingBases.WeaponAngle:
            float weaponAngle = _characterHandleWeapon.WeaponAimComponent.CurrentAngleAbsolute;
            if (Mathf.Abs(weaponAngle - _lastWeaponAngle) > AbsoluteThresholdWeapon)
            {
              if ((weaponAngle > 90) || (weaponAngle < -90))
              {
                FaceDirection(-1);
              }
              else if (weaponAngle != 90f && weaponAngle != -90f)
              {
                FaceDirection(1);
              }
            }
            _lastWeaponAngle = weaponAngle;
            break;
          case FacingBases.MousePositionX:
            if (_characterHandleWeapon.WeaponAimComponent.GetMousePosition().x < this.transform.position.x)
            {
              FaceDirection(-1);
            }
            else
            {
              FaceDirection(1);
            }
            break;
          case FacingBases.SceneReticlePositionX:
            if (_characterHandleWeapon.WeaponAimComponent.GetReticlePosition().x < this.transform.position.x)
            {
              FaceDirection(-1);
            }
            else
            {
              FaceDirection(1);
            }
            break;
          default:
            throw new ArgumentOutOfRangeException();
        }

        _horizontalDirection = _characterHandleWeapon.WeaponAimComponent.CurrentAimAbsolute.normalized.x;
        if (_character.CharacterDimension == Character.CharacterDimensions.Type2D)
        {
          _verticalDirection = _characterHandleWeapon.WeaponAimComponent.CurrentAimAbsolute.normalized.y;
        }
        else
        {
          _verticalDirection = _characterHandleWeapon.WeaponAimComponent.CurrentAimAbsolute.normalized.z;
        }
      }
    }
  }
}
