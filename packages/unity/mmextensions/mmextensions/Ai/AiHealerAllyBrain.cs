using System.Collections.Generic;
using KBVE.MMExtensions.Ai;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using Pathfinding;
using UnityEngine;

namespace KBVE.MMExtensions.Ai
{
    public class AiHealerAllyBrain : AIBrain
    {
        private const int PLAYER_LAYER_INT = 10;

        public Weapon initialWeapon;
        private AIDecisionDetectTargetRadius2D detectPlayerDecision;
        private AIDecisionDistanceToTarget distanceToTargetDecision;
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
            gameObject.MMGetOrAddComponent<Rigidbody2D>().sharedMaterial =
            CreateFrictionlessPhysicsMaterial();
            handleWeapon = gameObject.MMGetOrAddComponent<CharacterHandleWeapon>();
            handleWeapon.InitialWeapon = initialWeapon;
            handleWeapon.ForceWeaponAimControl = true;
            handleWeapon.ForcedWeaponAimControl = WeaponAim.AimControls.Script;
            SetupDecisionsAndActions();
            SetupAllyStates();
            base.Awake();
        }

        protected virtual void SetupDecisionsAndActions()
        {
            detectPlayerDecision = CreateDetectTarget2DDecision(PLAYER_LAYER_INT, 100f, false);
            distanceToTargetDecision = CreateDistanceToTarget2DDecision(
            9f,
            AIDecisionDistanceToTarget.ComparisonModes.LowerThan
            );
        }

        protected virtual void SetupAllyStates()
        {
            States = new List<AIState>
            {
            CreateIdleState(),
            CreateFollowPlayerState(),
            CreateHealState()
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
            new AITransition() { Decision = distanceToTargetDecision, TrueState = "Heal" }
            };

            return followState;
        }

        private AIState CreateHealState()
        {
            AIState healState = new AIState();
            healState.StateName = "Heal";

            AIActionShoot2D aIActionShoot2D = gameObject.MMGetOrAddComponent<AIActionShoot2D>();
            aIActionShoot2D.AimAtTarget = true;
            healState.Actions = new AIActionsList() { aIActionShoot2D };

            healState.Transitions = new AITransitionsList
            {
            new AITransition() { Decision = distanceToTargetDecision, FalseState = "Idle" }
            };
            return healState;
        }

        private AIDecisionDetectTargetRadius2D CreateDetectTarget2DDecision(
            int targetLayerInt,
            float radius,
            bool obstacleDetection = true
        )
        {
            AIDecisionDetectTargetRadius2D detectTargetDecision =
            gameObject.AddComponent<AIDecisionDetectTargetRadius2D>();
            detectTargetDecision.TargetLayer = 1 << targetLayerInt;
            detectTargetDecision.ObstacleDetection = obstacleDetection;
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

        public PhysicsMaterial2D CreateFrictionlessPhysicsMaterial()
        {
            return new PhysicsMaterial2D() { friction = 0 };
        }

        // var AllyPlayer = null; So an empty hashmap (dictionary) of all "ally players"
        // funnction -^ set the AllyPlayer via its ID.
    }
}