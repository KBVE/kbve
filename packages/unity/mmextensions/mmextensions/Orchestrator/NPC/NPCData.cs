using System.Collections.Generic;
using System.Linq;
using UnityEngine;


namespace KBVE.MMExtensions.Orchestrator.Core
{
    public enum AIType
    {
        None,
        Passive,
        Aggressive,
        Friendly,
    }


    [System.Flags]
    public enum AIBehaviorFlags
    {
        None = 0,
        Patrol = 1 << 0,
        Chase = 1 << 1,
        Flee = 1 << 2,
        UseCover = 1 << 3,
        AlertOthers = 1 << 4,
        Idle = 1 << 5,
        Investigate = 1 << 6,
        RangeAttack = 1 << 7,
        MeleeAttack = 1 << 8,
        Guard = 1 << 9,
        Follow = 1 << 10,
    }

    public enum FactionType
    {
        Neutral,
        Player,
        Enemy,
        Ally
    }

    /// <summary>
    /// Interface for NPC metadata component that holds NPC definition data
    /// </summary>
    public interface INPCMetadata
    {
        NPCDefinition Definition { get; }
        void Initialize(NPCDefinition definition);
    }

    public class NPCMetadata : MonoBehaviour, INPCMetadata
    {
        public NPCDefinition Definition { get; private set; }

        public void Initialize(NPCDefinition definition)
        {
            Definition = definition;

            name = definition.displayName;
            var animator = GetComponent<Animator>();
            if (animator && definition.animator)
                animator.runtimeAnimatorController = definition.animator;

            // Cache other fields if needed (health, faction, etc.)
        }
    }

    
}
