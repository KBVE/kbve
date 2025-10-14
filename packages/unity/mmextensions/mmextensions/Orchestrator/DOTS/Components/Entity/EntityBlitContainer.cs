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
        public MonsterBlit? Monster;
        public UnitBlit? Unit;
        public NPCBlit? NPC;
        public ItemBlit? Item;
        public PlayerBlit? Player;

    }
}