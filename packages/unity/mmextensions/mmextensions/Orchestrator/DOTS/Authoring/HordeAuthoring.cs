using NSprites;
using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;
using UnityEngine.Serialization;

/// DOTS v2

///TODO: Replace the 

namespace KBVE.MMExtensions.Orchestrator.DOTS
{

    /// <summary>
    /// Horde Mode Authoring component, replacing the FactoryAuthoring.
    /// </summary>
    [DisallowMultipleComponent]
    [RequireComponent(typeof(Transform))]
    [HelpURL("https://kbve.com/application/unity/#hordeauthoring")]
    public class HordeAuthoring : MonoBehaviour {
        private class HordeBaker : Baker<HordeAuthoring>
        {
            public override void Bake(HordeAuthoring authoring)
            {

            }
        }
    }
}