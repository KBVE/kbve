using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using UnityEngine;

namespace RareIcon
{
    /// <summary>Ensures exactly one BanditCamp exists in the world at any given time. Places the first camp at a random hex on a ring outside the Capital's territory after an initial delay; when an active camp dies (BuildingHealth → 0 → destroyed by BuildingDeathSystem), this system waits RespawnDelay then places the next one. SystemBase because building-entity instantiation uses the shared render prefab (managed resource).</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    public partial class BanditCampSpawnerSystem : SystemBase
    {
        const float HexSize          = 0.25f;
        const float BuildingZ        = -0.6f;
        const float FirstCampDelay   = 30f;
        const float RespawnDelay     = 90f;
        const int   PlacementRing    = 22;
        const int   PlacementJitter  = 6;
        const ushort CampMaxHp       = 300;

        float _spawnCheckTimer;
        uint  _rng = 0xCA11_CAFEu;

        protected override void OnCreate()
        {
            _spawnCheckTimer = FirstCampDelay;
        }

        protected override void OnUpdate()
        {
            _spawnCheckTimer -= SystemAPI.Time.DeltaTime;
            if (_spawnCheckTimer > 0f) return;

            int activeCamps = 0;
            foreach (var _ in SystemAPI.Query<RefRO<BanditCampTag>>()) activeCamps++;
            if (activeCamps > 0)
            {
                _spawnCheckTimer = 5f;
                return;
            }

            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital))
            {
                _spawnCheckTimer = 5f;
                return;
            }
            if (!SystemAPI.HasSingleton<BuildingPrefabSingleton>())
            {
                _spawnCheckTimer = 2f;
                return;
            }

            int2 capitalHex = SystemAPI.GetComponent<Building>(capital).RootHex;
            var prefab = SystemAPI.GetSingleton<BuildingPrefabSingleton>().Prefab;

            _rng = XorShift(_rng);
            float angle = (_rng & 0xFFFFu) / 65535f * math.PI * 2f;
            _rng = XorShift(_rng);
            int radius = PlacementRing + (int)(_rng % (uint)PlacementJitter);

            int2 campHex = new int2(
                capitalHex.x + (int)math.round(math.cos(angle) * radius),
                capitalHex.y + (int)math.round(math.sin(angle) * radius));

            float3 pos = HexMeshUtil.HexToWorld(campHex.x, campHex.y, HexSize);
            pos.z = BuildingZ;

            var em = EntityManager;
            var camp = em.Instantiate(prefab);
            em.SetComponentData(camp, LocalTransform.FromPosition(pos));
            em.SetComponentData(camp, new Building
            {
                Type         = BuildingType.BanditCamp,
                RootHex      = campHex,
                OwnerFaction = FactionType.Hostile,
            });
            em.SetComponentData(camp, new BuildingVisual { Value = BuildingType.GoblinCave });
            em.AddComponentData(camp, new BuildingHealth { Value = CampMaxHp, Max = CampMaxHp });
            em.AddComponent<BanditCampTag>(camp);

            uint nowTick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);
            em.AddComponentData(camp, new BanditCampState
            {
                NextRaidTick      = nowTick + 45000u,
                RaidCadenceTicks  = 45000u,
                RaidPartySize     = 6,
            });
            em.AddComponentData(camp, new Faction { Value = FactionType.Hostile });

            _spawnCheckTimer = RespawnDelay;
        }

        static uint XorShift(uint s)
        {
            s ^= s << 13;
            s ^= s >> 17;
            s ^= s << 5;
            return s == 0 ? 1u : s;
        }
    }
}
