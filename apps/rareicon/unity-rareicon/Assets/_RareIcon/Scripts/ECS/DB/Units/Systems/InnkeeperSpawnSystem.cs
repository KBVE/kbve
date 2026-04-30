using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Spawns the right Innkeeper NPC for each Inn entity and swaps her out when BuildingTier advances. Tier → ref string is hardcoded today (Inn → "innkeeper-bran", Tavern → "tavernkeeper-mira", Lodge → "lodgekeeper-thorin"); falls back to the first innkeeper in NpcdbCache if the named ref isn't authored yet. Despawns the prior keeper before spawning the new one so only one keeper is alive per Inn at a time. Managed SystemBase — touches NpcdbCache (managed Google.Protobuf) and reuses UnitSpawnSystem.SpawnGoblinAt as the humanoid template.</summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(InnTierServicesSystem))]
    public partial class InnkeeperSpawnSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            if (!NpcdbCache.IsLoaded) return;
            if (NpcdbCache.Innkeepers.Count == 0) return;

            var em = EntityManager;
            using var entities = GetEntityQuery(
                ComponentType.ReadOnly<InnTag>(),
                ComponentType.ReadOnly<BuildingTier>(),
                ComponentType.ReadOnly<Building>()
            ).ToEntityArray(Allocator.Temp);

            for (int i = 0; i < entities.Length; i++)
            {
                var inn = entities[i];
                byte tier = em.GetComponentData<BuildingTier>(inn).Value;

                if (!TryGetTargetKeeper(tier, out var keeperNpc, out uint targetHash))
                    continue;

                if (em.HasComponent<InnkeeperOwned>(inn))
                {
                    var owned = em.GetComponentData<InnkeeperOwned>(inn);
                    if (owned.KeeperRefHash == targetHash && em.Exists(owned.Keeper))
                        continue;
                    if (em.Exists(owned.Keeper))
                        em.DestroyEntity(owned.Keeper);
                }

                int2 hex = em.GetComponentData<Building>(inn).RootHex;
                uint rngSeed = (uint)inn.Index ^ targetHash ^ 0xC9E5A37Du;

                Entity keeper = UnitSpawnSystem.SpawnGoblinAt(
                    em, hex, rngSeed,
                    state:    default,
                    faction:  FactionType.Player,
                    unitType: UnitType.Merchant
                );
                if (keeper == Entity.Null) continue;

                em.AddComponentData(keeper, new InnkeeperTag { });
                em.AddComponentData(keeper, new InnkeeperLink     { Inn = inn });
                em.AddComponentData(keeper, new InnkeeperRefHash  { Value = targetHash });

                em.AddComponentData(inn, new InnkeeperOwned
                {
                    Keeper        = keeper,
                    KeeperRefHash = targetHash,
                });
            }
        }

        static bool TryGetTargetKeeper(byte tier, out KBVE.Proto.Npc.Npc npc, out uint hash)
        {
            string desiredRef = tier switch
            {
                0 => "innkeeper-bran",
                1 => "tavernkeeper-mira",
                _ => "lodgekeeper-thorin",
            };

            if (NpcdbCache.TryGetByRef(desiredRef, out npc))
            {
                hash = QuestdbCache.FnvHash32(desiredRef);
                return true;
            }

            int idx = System.Math.Min((int)tier, NpcdbCache.Innkeepers.Count - 1);
            npc = NpcdbCache.Innkeepers[idx];
            hash = QuestdbCache.FnvHash32(npc.Ref ?? string.Empty);
            return !string.IsNullOrEmpty(npc.Ref);
        }
    }
}
