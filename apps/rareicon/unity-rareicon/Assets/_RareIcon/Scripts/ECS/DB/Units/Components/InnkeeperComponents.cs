using Unity.Entities;

namespace RareIcon
{
    /// <summary>Marker tag for Innkeeper NPC units. Spawned + despawned by <see cref="InnkeeperSpawnSystem"/> in lockstep with their Inn's <see cref="BuildingTier"/>. Uses the existing UnitType.Merchant visual until tier-specific sprites land.</summary>
    public struct InnkeeperTag : IComponentData { }

    /// <summary>Back-pointer from a spawned Innkeeper Unit to the Inn building it serves. Lets dialogue / quest-board UI resolve the linked board buffer when the player interacts with the keeper.</summary>
    public struct InnkeeperLink : IComponentData
    {
        public Entity Inn;
    }

    /// <summary>Stable identifier for the NPC def the keeper was instantiated from. FNV-1a-32 hash of the npcdb ref string (e.g. "tavernkeeper-mira"). Quest board / dialogue systems match against the same hash carried in QuestDefRuntime.GiverNpcRefHash so guild quests filter to the right keeper.</summary>
    public struct InnkeeperRefHash : IComponentData
    {
        public uint Value;
    }

    /// <summary>Forward pointer on the Inn entity to its currently-spawned Innkeeper. Allows InnkeeperSpawnSystem to despawn the prior tier's keeper before spawning the next when BuildingTier advances.</summary>
    public struct InnkeeperOwned : IComponentData
    {
        public Entity Keeper;
        public uint   KeeperRefHash;
    }
}
