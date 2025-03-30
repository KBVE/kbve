using System.Collections;
using System.Collections.Generic;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using UnityEngine;

namespace KBVE.MMExtensions.Ai
{
  /// <summary>
  /// Requires a CharacterMovement ability. Makes the character move up to the specified MinimumDistance in the direction of the target.
  /// </summary>
  [AddComponentMenu("TopDown Engine/Character/AI/Actions/AiActionPathfinderToTarget2D")]
  [RequireComponent(typeof(AiCharacterPathfinder2D))]
  [RequireComponent(typeof(CharacterMovement))]
  //[RequireComponent(typeof(CharacterMovement))]
  //[RequireComponent(typeof(CharacterPathfinder3D))]
  public class AiActionPathfinderToTarget2D : AIAction
  {
    protected CharacterMovement _characterMovement;
    protected AiCharacterPathfinder2D _AiCharacterPathfinder2D;

    /// <summary>
    /// On init we grab our CharacterMovement ability
    /// </summary>
    public override void Initialization()
    {
      _characterMovement = this.gameObject
        .GetComponentInParent<Character>()
        ?.FindAbility<CharacterMovement>();
      _AiCharacterPathfinder2D = this.gameObject
        .GetComponentInParent<Character>()
        ?.FindAbility<AiCharacterPathfinder2D>();
      if (_AiCharacterPathfinder2D == null)
      {
        Debug.LogWarning(
          this.name
            + " : the AIActionPathfinderToTarget2D AI Action requires the CharacterPathfinder2D ability"
        );
      }
    }

    /// <summary>
    /// On PerformAction we move
    /// </summary>
    public override void PerformAction()
    {
      Move();
    }

    /// <summary>
    /// Moves the character towards the target if needed
    /// </summary>
    protected virtual void Move()
    {
      if (_brain.Target == null)
      {
        _AiCharacterPathfinder2D.SetNewDestination(null);
        return;
      }
      else
      {
        _AiCharacterPathfinder2D.SetNewDestination(_brain.Target.transform);
      }
    }

    /// <summary>
    /// On exit state we stop our movement
    /// </summary>
    public override void OnExitState()
    {
      base.OnExitState();

      _AiCharacterPathfinder2D?.SetNewDestination(null);
      _characterMovement?.SetHorizontalMovement(0f);
      _characterMovement?.SetVerticalMovement(0f);
    }
  }
}
