using System;
using System.Collections;
using System.Collections.Generic;
using Cysharp.Threading.Tasks;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using UnityEngine;
using UnityEngine.Serialization;
using UnityEngine.Tilemaps;

namespace KBVE.MMExtensions.Ai
{
    public class AiAllyBrain : AIBrain
    {

        //  AllyPlayers - [START]
        private Dictionary<string, Character> AllyPlayers { get; set; } = new Dictionary<string, Character>();

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
            gameObject.AddComponent<CharacterSwap>();
            base.Awake();
        }

        protected virtual void SetupAllyStates()
        {
            States = new List<AIState>();
            AIState idleState = new AIState();
            idleState.StateName = "Idle";
            
            idleState.Actions = new AIActionsList();
            AIAction doNothingAction = gameObject.MMGetOrAddComponent<AIActionDoNothing>();
            idleState.Actions.Add(doNothingAction);

            idleState.Transitions = new AITransitionsList();
            AITransition detectTargetTransition = new AITransition();
            AIDecision detectTargetDecision = gameObject.MMGetOrAddComponent<AIDecisionDetectTargetRadius2D>();
            detectTargetTransition.Decision = detectTargetDecision;
            idleState.Transitions.Add(detectTargetTransition);

            // AIState followState = new AIState();
            // followState.StateName = "Follow";

            // AIState moveToEnemyState = new AIState();
            // moveToEnemyState.StateName = "Move To Enemy";

            // AIState attackState = new AIState();
            // attackState.StateName = "Attack";

        }
        // var AllyPlayer = null; So an empty hashmap (dictionary) of all "ally players"
        // funnction -^ set the AllyPlayer via its ID.
    }
}