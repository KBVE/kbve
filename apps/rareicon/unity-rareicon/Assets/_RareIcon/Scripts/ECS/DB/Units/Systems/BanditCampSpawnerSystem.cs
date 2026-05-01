using MessagePipe;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using UnityEngine;

namespace RareIcon
{
    /// <summary>Maintains the active BanditCamp population over time. First camp lands ~30s after game start at a random hex on a ring outside the Capital. Cap starts at 1 and grows to a max of MaxCamps with 1 additional slot unlocked per CampGrowthIntervalSeconds of elapsed game time. Whenever the alive count falls below the current cap, the spawner places a new camp at a fresh ring position after RespawnDelay. SystemBase because building-entity instantiation + toast publish both need main-thread managed access.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    public partial class BanditCampSpawnerSystem : SystemBase
    {
        const float HexSize                     = 0.25f;
        const float BuildingZ                   = -0.6f;
        const float FirstCampDelay              = 30f;
        const float RespawnDelay                = 90f;
        const int   PlacementRing               = 22;
        const int   PlacementJitter             = 6;
        const ushort CampMaxHp                  = 300;
        const int   MaxCamps                    = 3;
        const float CampGrowthIntervalSeconds   = 100f;
        const int   DefenderCount               = 8;
        const int   DefenderJitter              = 2;

        float _spawnCheckTimer;
        uint  _rng = 0xCA11_CAFEu;
        int   _lastKnownCampCount;
        IPublisher<ToastMessage> _toastPub;

        EntityQuery _campQuery;

        protected override void OnCreate()
        {
            _spawnCheckTimer = FirstCampDelay;
            _campQuery = GetEntityQuery(ComponentType.ReadOnly<BanditCampTag>());
        }

        protected override void OnUpdate()
        {
            _spawnCheckTimer -= SystemAPI.Time.DeltaTime;

            int active = _campQuery.CalculateEntityCount();

            if (_lastKnownCampCount > 0 && active < _lastKnownCampCount)
            {
                PublishToast($"Bandit camp destroyed ({active}/{CurrentCap()} active)", ToastKind.Success);
            }
            _lastKnownCampCount = active;

            if (_spawnCheckTimer > 0f) return;

            int cap = CurrentCap();
            if (active >= cap)
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
            var prefab      = SystemAPI.GetSingleton<BuildingPrefabSingleton>().Prefab;

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
            float scale = BuildingDB.GetVisualScale(BuildingType.BanditCamp);
            em.SetComponentData(camp, LocalTransform.FromPositionRotationScale(pos, quaternion.identity, scale));
            em.SetComponentData(camp, new Building
            {
                Type         = BuildingType.BanditCamp,
                RootHex      = campHex,
                OwnerFaction = FactionType.Hostile,
            });
            em.SetComponentData(camp, new BuildingVisual { Value = BuildingType.BanditCamp });
            em.AddComponentData(camp, new BuildingHealth { Value = CampMaxHp, Max = CampMaxHp });
            em.AddComponent<BanditCampTag>(camp);
            em.AddComponent<HostileTerritoryRoot>(camp);
            em.AddComponentData(camp, new TerritoryEmitter
            {
                Center       = campHex,
                Radius       = 2,
                OwnerFaction = FactionType.Hostile,
            });

            uint nowTick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);
            em.AddComponentData(camp, new BanditCampState
            {
                NextRaidTick      = nowTick + 45000u,
                RaidCadenceTicks  = 45000u,
                RaidPartySize     = 6,
            });
            em.AddComponentData(camp, new BanditCampGrowth
            {
                NextEvolveTick     = nowTick + 180000u,
                EvolveCadenceTicks = 180000u,
                Tier               = 0,
            });
            em.AddComponentData(camp, new Faction { Value = FactionType.Hostile });

            for (int i = 0; i < DefenderCount; i++)
            {
                _rng = XorShift(_rng);
                int dx = (int)(_rng % (uint)(DefenderJitter * 2 + 1)) - DefenderJitter;
                _rng = XorShift(_rng);
                int dy = (int)(_rng % (uint)(DefenderJitter * 2 + 1)) - DefenderJitter;
                int2 defHex = new int2(campHex.x + dx, campHex.y + dy);
                _rng = XorShift(_rng);
                var defender = UnitSpawnSystem.SpawnBanditAt(em, defHex, _rng | 1u);
                if (defender != Entity.Null)
                    em.AddComponentData(defender, new GarrisonPost { Hex = defHex });
            }

            _lastKnownCampCount = active + 1;
            PublishToast($"Bandit camp spotted ({_lastKnownCampCount}/{cap} active)", ToastKind.Warning);

            _spawnCheckTimer = RespawnDelay;
        }

        int CurrentCap()
        {
            float elapsed = (float)SystemAPI.Time.ElapsedTime;
            int growth = (int)math.floor(elapsed / CampGrowthIntervalSeconds);
            return math.min(1 + growth, MaxCamps);
        }

        void PublishToast(string text, ToastKind kind)
        {
            if (_toastPub == null)
            {
                try { _toastPub = GlobalMessagePipe.GetPublisher<ToastMessage>(); }
                catch { return; }
            }
            _toastPub?.Publish(new ToastMessage(text, kind));
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
