using System;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Container that holds EntityBlit + optional type-specific data.
    /// Only the relevant type-specific blit is populated.
    /// </summary>
    public struct EntityBlitContainer
    {
        public EntityBlit Entity;

        // Only one of these will have meaningful data
        public ResourceBlit? Resource;
        public StructureBlit? Structure;
        public CombatantBlit? Combatant;
        public ItemBlit? Item;

        // Convenience properties for checking what data is available
        public bool HasResource => Resource.HasValue;
        public bool HasStructure => Structure.HasValue;
        public bool HasCombatant => Combatant.HasValue;
        public bool HasItem => Item.HasValue;
    }
}