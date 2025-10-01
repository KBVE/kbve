/// DOTS v2
namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Entity type classification.
    /// </summary>
    public enum EntityType : byte
    {
        None = 0, Player = 1, Zombie = 2, NPC = 3, Building = 4, Projectile = 5
    }
    
    /// <summary>
    /// Faction types matching the existing system
    /// </summary>
    public enum FactionType : byte
    {
        Neutral = 0,
        Player = 1,
        Enemy = 2,
        Ally = 3,
        Wildlife = 4,
        Undead = 5,
        Demon = 6,
        All = 255 // For AoE that affects everyone
    }
}