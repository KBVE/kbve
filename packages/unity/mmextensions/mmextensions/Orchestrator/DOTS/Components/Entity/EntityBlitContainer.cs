using System;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Burst-compatible container that holds EntityData + optional type-specific data.
    /// Uses flags and non-nullable fields for Burst compatibility.
    /// Updated to use new protobuf-powered data types.
    /// </summary>
    public struct EntityBlitContainer
    {
        public EntityData Entity;   // Universal entity data

        // Non-nullable type-specific data (use HasX flags to check validity)
        public ResourceData Resource;   // Use HasResource to check if valid
        public StructureData Structure; // Use HasStructure to check if valid
        public CombatantData Combatant; // Use HasCombatant to check if valid
        public ItemData Item;           // Use HasItem to check if valid
        public PlayerData Player;       // Use HasPlayer to check if valid

        // Flags to indicate which data is valid (Burst-compatible)
        public bool HasResource;
        public bool HasStructure;
        public bool HasCombatant;
        public bool HasItem;
        public bool HasPlayer;

        /// <summary>Sets Resource data and marks it as valid</summary>
        public void SetResource(ResourceData resource)
        {
            Resource = resource;
            HasResource = true;
        }

        /// <summary>Sets Structure data and marks it as valid</summary>
        public void SetStructure(StructureData structure)
        {
            Structure = structure;
            HasStructure = true;
        }

        /// <summary>Sets Combatant data and marks it as valid</summary>
        public void SetCombatant(CombatantData combatant)
        {
            Combatant = combatant;
            HasCombatant = true;
        }

        /// <summary>Sets Item data and marks it as valid</summary>
        public void SetItem(ItemData item)
        {
            Item = item;
            HasItem = true;
        }

        /// <summary>Sets Player data and marks it as valid</summary>
        public void SetPlayer(PlayerData player)
        {
            Player = player;
            HasPlayer = true;
        }

        /// <summary>Clears all type-specific data</summary>
        public void Clear()
        {
            HasResource = false;
            HasStructure = false;
            HasCombatant = false;
            HasItem = false;
            HasPlayer = false;

            // Reset data to default values
            Resource = default;
            Structure = default;
            Combatant = default;
            Item = default;
            Player = default;
        }
    }
}