using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Static producer API for <see cref="BuildingsDBSingleton.Events"/>. Per-type lifecycle systems (ConstructionCompleteSystem, BuildingDeathSystem, BuildingUpgradeSystem, BuildingRepairSystem, DemolishBuildingSystem) call these helpers right after they apply the state change so the Bridge can publish a main-thread MessagePipe event next Presentation tick. Zero managed allocation — events are blittable structs appended to a Persistent NativeList.</summary>
    public static class BuildingsDB
    {
        static bool TryGetDB(World world, out BuildingsDBSingleton db)
        {
            db = default;
            if (world == null || !world.IsCreated) return false;
            var em = world.EntityManager;
            using var q = em.CreateEntityQuery(ComponentType.ReadWrite<BuildingsDBSingleton>());
            if (q.CalculateEntityCount() == 0) return false;
            db = em.GetComponentData<BuildingsDBSingleton>(q.GetSingletonEntity());
            return true;
        }

        static void Enqueue(World world, in BuildingEvent evt)
        {
            if (!TryGetDB(world, out var db)) return;
            if (!db.Events.IsCreated) return;
            db.Events.Add(evt);
        }

        public static void EnqueueSpawned(World w, Entity e, byte type, int2 hex, byte faction) =>
            Enqueue(w, new BuildingEvent
            {
                Kind = BuildingEventKind.Spawned,
                Entity = e, Type = type, RootHex = hex, OwnerFaction = faction,
            });

        public static void EnqueueConstructionComplete(World w, Entity e, byte type, int2 hex, byte faction) =>
            Enqueue(w, new BuildingEvent
            {
                Kind = BuildingEventKind.ConstructionComplete,
                Entity = e, Type = type, RootHex = hex, OwnerFaction = faction,
            });

        public static void EnqueueTierChanged(World w, Entity e, byte type, byte newTier) =>
            Enqueue(w, new BuildingEvent
            {
                Kind = BuildingEventKind.TierChanged,
                Entity = e, Type = type, Tier = newTier,
            });

        public static void EnqueueDamaged(World w, Entity e, int damage, ushort healthAfter) =>
            Enqueue(w, new BuildingEvent
            {
                Kind = BuildingEventKind.Damaged,
                Entity = e, HealthDelta = damage, HealthCurrent = healthAfter,
            });

        public static void EnqueueRepaired(World w, Entity e, int healAmount, ushort healthAfter) =>
            Enqueue(w, new BuildingEvent
            {
                Kind = BuildingEventKind.Repaired,
                Entity = e, HealthDelta = healAmount, HealthCurrent = healthAfter,
            });

        public static void EnqueueDestroyed(World w, Entity e, byte type, int2 hex, byte faction) =>
            Enqueue(w, new BuildingEvent
            {
                Kind = BuildingEventKind.Destroyed,
                Entity = e, Type = type, RootHex = hex, OwnerFaction = faction,
            });

        public static void EnqueueDemolished(World w, Entity e, byte type, int2 hex) =>
            Enqueue(w, new BuildingEvent
            {
                Kind = BuildingEventKind.Demolished,
                Entity = e, Type = type, RootHex = hex,
            });
    }
}
