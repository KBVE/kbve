using Unity.Entities;
using Unity.Mathematics;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Tag to identify zombie horde entities - like Age-of-Sprites squads
    /// </summary>
    public struct ZombieHordeTag : IComponentData
    {
    }

    /// <summary>
    /// Horde formation settings - similar to Age-of-Sprites SquadSettings
    /// </summary>
    public struct ZombieHordeSettings : IComponentData
    {
        public int2 formation; // Grid formation (width x height)
        public float spacing;  // Distance between zombies
    }

    /// <summary>
    /// Link from horde to individual zombie - like Age-of-Sprites SoldierLink
    /// </summary>
    public struct ZombieLink : IBufferElementData
    {
        public Entity zombie;
    }

    /// <summary>
    /// Horde movement target - where the horde should move
    /// </summary>
    public struct ZombieHordeTarget : IComponentData
    {
        public float2 position;
    }
}