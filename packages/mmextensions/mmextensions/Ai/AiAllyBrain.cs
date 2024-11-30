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

        // var AllyPlayer = null; So an empty hashmap (dictionary) of all "ally players"
        // funnction -^ set the AllyPlayer via its ID.
    }
}