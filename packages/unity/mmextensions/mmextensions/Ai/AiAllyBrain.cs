using System;
using System.Collections;
using System.Collections.Generic;
using Cysharp.Threading.Tasks;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using MoreMountains.InventoryEngine;
using Pathfinding;
using UnityEngine;
using UnityEngine.Serialization;
using UnityEngine.Tilemaps;
using KBVE.MMExtensions.Weapons;

namespace KBVE.MMExtensions.Ai
{
    public class AiAllyBrain : AIBrain, MMEventListener<PickableItemEvent>
    {
        private const int PLAYER_LAYER_INT = 10;
        private const int ENEMY_LAYER_INT = 13;

        public Weapon initialWeapon;
        private AIDecisionDetectTargetRadius2D detectPlayerDecision;
        private AIDecisionDetectTargetRadius2D detectEnemyDecision;
        private AIDecisionDistanceToTarget distanceToTarget2fDecision;
        private AIDecisionDistanceToTarget distanceToTarget4fDecision;
        private AIDecisionTargetIsAlive targetIsAliveDecision;
        private AIDecisionTimeInState timeInStateDecision;
        private CharacterHandleWeapon handleWeapon;
        private AIActionDoNothing actionDoNothing;
        private AiActionPathfinderToTarget2D actionPathfinder;
        private AIActionMoveTowardsTarget2D actionMoveTowardTarget;
        private AIActionShoot2D aIActionShoot;
        private WeaponAim.AimControls playerForcedWeaponAimControl = WeaponAim.AimControls.Mouse;
        private WeaponAim.AimControls aiForcedWeaponAimControl = WeaponAim.AimControls.Script;

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
            SetupDecisionsHealer();
            SetupDecisionsAttacker();
            SetupActions();
            base.Awake();
        }

        protected override void Start()
        {
            base.Start();
            ToggleAI(!GetComponent<CharacterSwap>().Current());
        }

        public void ToggleAI(bool aiControl)
        {
            handleWeapon.ForceWeaponAimControl = true;
            handleWeapon.ForcedWeaponAimControl = aiControl ? aiForcedWeaponAimControl : playerForcedWeaponAimControl;
            if(aiControl) handleWeapon.OnWeaponChange += handleWeapon_OnWeaponChange;
            else handleWeapon.OnWeaponChange -= handleWeapon_OnWeaponChange;
            if(handleWeapon.WeaponAimComponent != null)
            {
                handleWeapon.WeaponAimComponent.AimControl = handleWeapon.ForcedWeaponAimControl;
                handleWeapon.WeaponAimComponent.ApplyAim();
            }
            ApplyBrainStateBasedOffWeapon();
            BrainActive = aiControl;
        }

        protected override void OnEnable()
        {
            base.OnEnable();
            this.MMEventStartListening<PickableItemEvent>();
        }


        protected void OnDisable()
        {
            this.MMEventStopListening<PickableItemEvent>();
        }

        protected void OnDestroy()
        {
            if (handleWeapon != null)
            {
                handleWeapon.OnWeaponChange -= handleWeapon_OnWeaponChange;
            }
        }

        protected virtual void handleWeapon_OnWeaponChange()
        {
            ApplyBrainStateBasedOffWeapon();
        }

        private void ApplyBrainStateBasedOffWeapon()
        {
            var weapon = handleWeapon.CurrentWeapon;

            if (weapon == null)
            {
                States = new List<AIState>();
                ResetBrain();
                return;
            }

            if (weapon.GetComponent<HealWeapon>() != null)
            {
                SetupAllyHealerStates();
            }
            else
            {
                SetupAllyAttackerStates();
            }

            if (States != null)
            {
                foreach (AIState state in States)
                {
                    if (state != null)
                        state.SetBrain(this);
                }
            }

            ResetBrain();
        }

        protected virtual void SetupDecisionsAttacker()
        {
            detectPlayerDecision = CreateDetectTarget2DDecision(PLAYER_LAYER_INT, 100f, false);
            detectEnemyDecision = CreateDetectTarget2DDecision(ENEMY_LAYER_INT, 20f);
            distanceToTarget2fDecision = CreateDistanceToTarget2DDecision(
                    2f,
                    AIDecisionDistanceToTarget.ComparisonModes.LowerThan
                    );
            distanceToTarget4fDecision = CreateDistanceToTarget2DDecision(
                    4f,
                    AIDecisionDistanceToTarget.ComparisonModes.LowerThan
                    );
            targetIsAliveDecision = CreateTargetIsAliveDecision();
            timeInStateDecision = CreateTimeInStateDecision(2f, 2f);
        }

        protected virtual void SetupActions()
        {
            actionDoNothing = gameObject.MMGetOrAddComponent<AIActionDoNothing>();
            actionPathfinder = gameObject.MMGetOrAddComponent<AiActionPathfinderToTarget2D>();
            actionMoveTowardTarget = gameObject.MMGetOrAddComponent<AIActionMoveTowardsTarget2D>();
            aIActionShoot = gameObject.MMGetOrAddComponent<AIActionShoot2D>();
            aIActionShoot.AimAtTarget = true;
        }

        protected virtual void SetupAllyAttackerStates()
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
                actionDoNothing
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
                actionPathfinder
            };

            followState.Transitions = new AITransitionsList
            {
                new AITransition() { Decision = detectEnemyDecision, TrueState = "ChaseEnemy" },
                new AITransition() { Decision = distanceToTarget4fDecision, TrueState = "Idle" }
            };

            return followState;
        }

        private AIState CreateChaseEnemyState()
        {
            AIState chaseEnemyState = new AIState();
            chaseEnemyState.StateName = "ChaseEnemy";

            chaseEnemyState.Actions = new AIActionsList()
            {
                actionMoveTowardTarget
            };

            chaseEnemyState.Transitions = new AITransitionsList
            {
                new AITransition() { Decision = detectEnemyDecision, FalseState = "Idle" },
                new AITransition() { Decision = distanceToTarget2fDecision, TrueState = "Attack" },
                new AITransition() { Decision = targetIsAliveDecision, FalseState = "Idle" }
            };

            return chaseEnemyState;
        }

        private AIState CreateAttackState()
        {
            AIState attackState = new AIState();
            attackState.StateName = "Attack";

            attackState.Actions = new AIActionsList() { aIActionShoot };

            attackState.Transitions = new AITransitionsList
            {
                new AITransition() { Decision = detectEnemyDecision, FalseState = "Idle" },
                new AITransition() { Decision = distanceToTarget2fDecision, FalseState = "ChaseEnemy" },
                new AITransition() { Decision = timeInStateDecision, TrueState = "ChaseEnemy" }
            };
            return attackState;
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

        private AIDecisionDistanceToTarget distanceToTarget9fDecision;

        protected virtual void SetupDecisionsHealer()
        {
            detectPlayerDecision = CreateDetectTarget2DDecision(PLAYER_LAYER_INT, 100f, false);
            distanceToTarget9fDecision = CreateDistanceToTarget2DDecision(
                    9f,
                    AIDecisionDistanceToTarget.ComparisonModes.LowerThan
                    );
        }

        protected virtual void SetupAllyHealerStates()
        {
            States = new List<AIState>
            {
                CreateIdleState(),
                CreateFollowPlayerHealState(),
                CreateHealState()
            };
        }

        private AIState CreateFollowPlayerHealState()
        {
            AIState followState = new AIState();
            followState.StateName = "Follow";

            followState.Actions = new AIActionsList()
            {
                actionPathfinder
            };

            followState.Transitions = new AITransitionsList
            {
                new AITransition() { Decision = distanceToTarget9fDecision, TrueState = "Heal" }
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
                new AITransition() { Decision = distanceToTarget9fDecision, FalseState = "Idle" }
            };
            return healState;
        }

        public void OnMMEvent(PickableItemEvent eventData)
        {
            ItemPicker itemPicker = eventData.PickedItem.GetComponent<ItemPicker>();
            AiAllyBrain aiAllyBrain = eventData.Picker.GetComponent<AiAllyBrain>();
            if (itemPicker?.Item is InventoryWeapon weaponItem)
            {
                aiAllyBrain?.GetComponent<CharacterHandleWeapon>().ChangeWeapon(weaponItem.EquippableWeapon, weaponItem.EquippableWeapon.name);
            }
        }
    }
}
