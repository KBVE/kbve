namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Common entity type combinations for convenience.
    /// These are NOT required, just helpful shortcuts.
    /// </summary>
    public static class EntityTypePresets
    {
        // === MONSTERS ===
        public static readonly EntityType BasicMonster = 
            EntityType.Monster | EntityType.Enemy | EntityType.Destructible;

        public static readonly EntityType BossMonster = 
            EntityType.Monster | EntityType.Enemy | EntityType.Boss | EntityType.Destructible;

        public static readonly EntityType LegendaryBoss = 
            EntityType.Monster | EntityType.Enemy | EntityType.Boss | EntityType.Legendary | EntityType.Destructible;

        public static readonly EntityType EliteMob = 
            EntityType.Monster | EntityType.Enemy | EntityType.Elite | EntityType.Destructible;

        // === RESOURCES ===
        public static readonly EntityType BasicResource = 
            EntityType.Resource | EntityType.Interactable | EntityType.Neutral;

        public static readonly EntityType RareResource = 
            EntityType.Resource | EntityType.Rare | EntityType.Interactable | EntityType.Destructible | EntityType.Neutral;

        public static readonly EntityType DepletableResource = 
            EntityType.Resource | EntityType.Interactable | EntityType.Destructible | EntityType.Neutral | EntityType.Temporary;

        // === UNITS ===
        public static readonly EntityType PlayerUnit = 
            EntityType.Unit | EntityType.Player | EntityType.Ally;

        public static readonly EntityType EnemyUnit = 
            EntityType.Unit | EntityType.Enemy | EntityType.Destructible;

        public static readonly EntityType NeutralNPC = 
            EntityType.Unit | EntityType.NPC | EntityType.Neutral | EntityType.Interactable;

        // === STRUCTURES ===
        public static readonly EntityType BasicStructure = 
            EntityType.Structure | EntityType.Destructible;

        public static readonly EntityType PlayerStructure = 
            EntityType.Structure | EntityType.Player | EntityType.Ally | EntityType.Destructible | EntityType.Upgradeable;

        public static readonly EntityType EnemyStructure = 
            EntityType.Structure | EntityType.Enemy | EntityType.Destructible;

        // === ITEMS ===
        public static readonly EntityType QuestItem = 
            EntityType.Item | EntityType.Quest | EntityType.Collectible;

        public static readonly EntityType ConsumableItem = 
            EntityType.Item | EntityType.Consumable | EntityType.Collectible | EntityType.Stackable;

        public static readonly EntityType EquipmentItem = 
            EntityType.Item | EntityType.Equippable | EntityType.Collectible | EntityType.Upgradeable;

        public static readonly EntityType LegendaryEquipment = 
            EntityType.Item | EntityType.Equippable | EntityType.Legendary | EntityType.Collectible | EntityType.Upgradeable;
    }

    /// <summary>
    /// Common action flag combinations
    /// </summary>
    public static class EntityActionPresets
    {
        public static readonly EntityActionFlags IdleUnit = 
            EntityActionFlags.Idle | EntityActionFlags.CanMove | EntityActionFlags.CanAttack;

        public static readonly EntityActionFlags AggressiveMonster = 
            EntityActionFlags.Aggressive | EntityActionFlags.CanMove | EntityActionFlags.CanAttack;

        public static readonly EntityActionFlags HarvesterUnit = 
            EntityActionFlags.Idle | EntityActionFlags.CanMove | EntityActionFlags.CanHarvest | EntityActionFlags.CanInteract;

        public static readonly EntityActionFlags BuilderUnit = 
            EntityActionFlags.Idle | EntityActionFlags.CanMove | EntityActionFlags.CanBuild | EntityActionFlags.CanInteract;

        public static readonly EntityActionFlags DeadEntity = 
            EntityActionFlags.Dead;

        public static readonly EntityActionFlags ProducingStructure = 
            EntityActionFlags.Producing | EntityActionFlags.Idle;
    }
}