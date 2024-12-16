using System;
using System.Collections;
using System.Collections.Generic;
using Cysharp.Threading.Tasks;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using Pathfinding;
using UnityEngine;
using UnityEngine.Serialization;
using UnityEngine.Tilemaps;

namespace KBVE.MMExtensions.Ai
{
  public class AiAllyBrain : AIBrain
  {
    private const int PLAYER_LAYER_INT = 10;
    private const int ENEMY_LAYER_INT = 13;

    public Weapon initialWeapon;
    private AIDecisionDetectTargetRadius2D detectPlayerDecision;
    private AIDecisionDetectTargetRadius2D detectEnemyDecision;
    private AIDecisionDistanceToTarget distanceToTargetDecision;
    private AIDecisionTargetIsAlive targetIsAliveDecision;
    private AIDecisionTimeInState timeInStateDecision;
    private CharacterHandleWeapon handleWeapon;

    //  AllyPlayers - [START]
    private Dictionary<string, Character> AllyPlayers { get; set; } =
      new Dictionary<string, Character>();

    public void SetAllyPlayer(string ulid, Character allyCharacter)
    {
      if (AllyPlayers.ContainsKey(ulid))
      {
        AllyPlayers[ulid] = allyCharacter;
        Debug.Log($"Updated ally with ULID: {ulid}");
      }
      else
      {
        AllyPlayers.Add(ulid, allyCharacter);
        Debug.Log($"Added new ally with ULID: {ulid}");
      }
    }

    public void RemoveAllyPlayer(string ulid)
    {
      if (AllyPlayers.ContainsKey(ulid))
      {
        AllyPlayers.Remove(ulid);
        Debug.Log($"Removed ally with ULID: {ulid}");
      }
      else
      {
        Debug.LogWarning($"Attempted to remove non-existent ally with ULID: {ulid}");
      }
    }

    public Character GetAllyPlayer(string ulid)
    {
      AllyPlayers.TryGetValue(ulid, out var allyCharacter);
      return allyCharacter;
    }

    public List<Character> GetAllAllies()
    {
      return new List<Character>(AllyPlayers.Values);
    }

    //  AllyPlayers - [END]


    protected override void Awake()
    {
      // Setup the character with required decisions + actions
      gameObject.MMGetOrAddComponent<CharacterSwap>();
      gameObject.MMGetOrAddComponent<AiCharacterPathfinder2D>();
      gameObject.MMGetOrAddComponent<Seeker>();
      handleWeapon = gameObject.MMGetOrAddComponent<CharacterHandleWeapon>();
      handleWeapon.InitialWeapon = initialWeapon;
      handleWeapon.ForceWeaponAimControl = true;
      handleWeapon.ForcedWeaponAimControl = WeaponAim.AimControls.Off;
      SetupDecisionsAndActions();
      SetupAllyStates();
      base.Awake();
    }

    protected virtual void SetupDecisionsAndActions()
    {
      detectPlayerDecision = CreateDetectTarget2DDecision(PLAYER_LAYER_INT, 20f);
      detectEnemyDecision = CreateDetectTarget2DDecision(ENEMY_LAYER_INT, 20f);
      distanceToTargetDecision = CreateDistanceToTarget2DDecision(
        2f,
        AIDecisionDistanceToTarget.ComparisonModes.LowerThan
      );
      targetIsAliveDecision = CreateTargetIsAliveDecision();
      timeInStateDecision = CreateTimeInStateDecision(2f, 2f);
    }

    protected virtual void SetupAllyStates()
    {
      States = new List<AIState>
      {
        CreateIdleState(),
        CreateFollowPlayerState(),
        CreateChaseEnemyState(),
        CreateAttackState()
      };
    }

    private AIState CreateIdleState()
    {
      AIState idleState = new AIState();
      idleState.StateName = "Idle";

      idleState.Actions = new AIActionsList()
      {
        gameObject.MMGetOrAddComponent<AIActionDoNothing>()
      };

      idleState.Transitions = new AITransitionsList
      {
        new AITransition() { Decision = detectPlayerDecision, TrueState = "Follow" }
      };

      return idleState;
    }

    private AIState CreateFollowPlayerState()
    {
      AIState followState = new AIState();
      followState.StateName = "Follow";

      followState.Actions = new AIActionsList()
      {
        gameObject.MMGetOrAddComponent<AiActionPathfinderToTarget2D>()
      };

      followState.Transitions = new AITransitionsList
      {
        new AITransition() { Decision = detectEnemyDecision, TrueState = "ChaseEnemy" }
      };

      return followState;
    }

    private AIState CreateChaseEnemyState()
    {
      AIState chaseEnemyState = new AIState();
      chaseEnemyState.StateName = "ChaseEnemy";

      chaseEnemyState.Actions = new AIActionsList()
      {
        gameObject.MMGetOrAddComponent<AIActionMoveTowardsTarget2D>()
      };

      chaseEnemyState.Transitions = new AITransitionsList
      {
        new AITransition() { Decision = detectEnemyDecision, FalseState = "Idle" },
        new AITransition() { Decision = distanceToTargetDecision, TrueState = "Attack" },
        new AITransition() { Decision = targetIsAliveDecision, FalseState = "Idle" }
      };

      return chaseEnemyState;
    }

    private AIState CreateAttackState()
    {
      AIState attackState = new AIState();
      attackState.StateName = "Attack";

      attackState.Actions = new AIActionsList()
      {
        gameObject.MMGetOrAddComponent<AIActionShoot2D>()
      };

      attackState.Transitions = new AITransitionsList
      {
        new AITransition() { Decision = detectEnemyDecision, FalseState = "Idle" },
        new AITransition() { Decision = distanceToTargetDecision, FalseState = "ChaseEnemy" },
        new AITransition() { Decision = timeInStateDecision, TrueState = "ChaseEnemy" }
      };
      return attackState;
    }

    private AIDecisionDetectTargetRadius2D CreateDetectTarget2DDecision(
      int targetLayerInt,
      float radius
    )
    {
      AIDecisionDetectTargetRadius2D detectTargetDecision =
        gameObject.AddComponent<AIDecisionDetectTargetRadius2D>();
      detectTargetDecision.TargetLayer = 1 << targetLayerInt;
      detectTargetDecision.Radius = radius;

      return detectTargetDecision;
    }

    private AIDecisionDistanceToTarget CreateDistanceToTarget2DDecision(
      float distance,
      AIDecisionDistanceToTarget.ComparisonModes comparisonMode
    )
    {
      AIDecisionDistanceToTarget detectDistanceToTarget =
        gameObject.AddComponent<AIDecisionDistanceToTarget>();
      detectDistanceToTarget.Distance = distance;
      detectDistanceToTarget.ComparisonMode = comparisonMode;
      return detectDistanceToTarget;
    }

    private AIDecisionTargetIsAlive CreateTargetIsAliveDecision()
    {
      AIDecisionTargetIsAlive targetIsAlive = gameObject.AddComponent<AIDecisionTargetIsAlive>();
      return targetIsAlive;
    }

    private AIDecisionTimeInState CreateTimeInStateDecision(float afterTimeMin, float afterTimeMax)
    {
      AIDecisionTimeInState timeInState = gameObject.AddComponent<AIDecisionTimeInState>();
      timeInState.AfterTimeMin = afterTimeMin;
      timeInState.AfterTimeMax = afterTimeMax;
      return timeInState;
    }

    // var AllyPlayer = null; So an empty hashmap (dictionary) of all "ally players"
    // funnction -^ set the AllyPlayer via its ID.
  }
}
