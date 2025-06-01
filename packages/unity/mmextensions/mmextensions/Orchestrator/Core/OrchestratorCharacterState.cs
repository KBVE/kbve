using System;
using System.Collections.Generic;
using KBVE.MMExtensions.Orchestrator.Health;
using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.Core 
{

    public class ActiveConsumable
    {
        public required string ItemID;
        public StatModifier Modifier;
        public float Duration;
        public float StartTime;

        public bool IsExpired(float currentTime) => (currentTime - StartTime) >= Duration;
    }

    public class OrchestratorCharacterState
    {
        public Vector3 Position;
        public Quaternion Rotation; 

        public List<ActiveConsumable> ActiveConsumables = new();
        public Dictionary<StatType, float> TimedBonuses = new();
        public Dictionary<string, float> Cooldowns = new();

        public float LastUpdateTime; 
    }

    
}