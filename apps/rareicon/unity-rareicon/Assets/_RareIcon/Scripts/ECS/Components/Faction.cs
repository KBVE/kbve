using Unity.Entities;

namespace RareIcon
{
    /// <summary>
    /// Faction IDs — drive "who can hit whom" in the collision pass.
    /// Projectile.OwnerFaction is compared against the target's Faction;
    /// matching factions never damage each other (no friendly fire).
    /// Add new factions at the end so existing byte values stay stable.
    /// </summary>
    public static class FactionType
    {
        public const byte Neutral  = 0;   // environmental, non-combatant
        public const byte Player   = 1;   // knight / soldier / mage (for now)
        public const byte Hostile  = 2;   // goblin and future raider types
        public const byte Beast    = 3;   // wolves, bears — hostile to everyone
        public const byte Wildlife = 4;   // chickens / sheep / cows — passive, killable in crossfire
    }

    /// <summary>
    /// Per-entity faction tag. Attach to any combatant that participates
    /// in collision / damage. Entities without this component are
    /// invisible to the collision pass — useful for purely-visual or
    /// environmental entities that shouldn't block arrows.
    /// </summary>
    [Unity.NetCode.GhostComponent]
    public struct Faction : IComponentData
    {
        [Unity.NetCode.GhostField] public byte Value;
    }
}
