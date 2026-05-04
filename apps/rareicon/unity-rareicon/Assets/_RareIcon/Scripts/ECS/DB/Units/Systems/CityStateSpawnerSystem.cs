using MessagePipe;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Drops 1-3 independent city-states on a ring outside the Capital at world-gen, faction Neutral by default. Mirror of <see cref="BanditCampSpawnerSystem"/> — same prefab + ring placement style, but the result is a peaceful Neutral settlement instead of a hostile camp. Subsequent diplomacy + raid systems read CityStateDisposition / CityStateStatus to drive behavior. SystemBase because building-entity instantiation + toast publish need main-thread managed access.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(EmpireSystemGroup))]
    public partial class CityStateSpawnerSystem : SystemBase
    {
        const float HexSize           = 0.25f;
        const float BuildingZ         = -0.6f;
        const float FirstSpawnDelay   = 60f;
        const int   PlacementRing     = 38;
        const int   PlacementJitter   = 14;
        const ushort CityMaxHp        = 600;
        const int   MaxCityStates     = 3;
        const float SpawnInterval     = 240f;
        const byte  StartingMood      = 50;
        const sbyte DriftPerCadence   = 1;

        float _spawnCheckTimer;
        uint  _rng = 0xC1721337u;
        IPublisher<ToastMessage> _toastPub;
        EntityQuery _cityQuery;

        protected override void OnCreate()
        {
            _spawnCheckTimer = FirstSpawnDelay;
            _cityQuery = GetEntityQuery(ComponentType.ReadOnly<CityStateTag>());
        }

        protected override void OnUpdate()
        {
            _spawnCheckTimer -= SystemAPI.Time.DeltaTime;
            if (_spawnCheckTimer > 0f) return;

            int active = _cityQuery.CalculateEntityCount();
            if (active >= MaxCityStates)
            {
                _spawnCheckTimer = SpawnInterval;
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

            int2 cityHex = new int2(
                capitalHex.x + (int)math.round(math.cos(angle) * radius),
                capitalHex.y + (int)math.round(math.sin(angle) * radius));

            float3 pos = HexMeshUtil.HexToWorld(cityHex.x, cityHex.y, HexSize);
            pos.z = BuildingZ;

            var em = EntityManager;
            var city = em.Instantiate(prefab);
            float scale = BuildingDB.GetVisualScale(BuildingType.CityState);
            em.SetComponentData(city, LocalTransform.FromPositionRotationScale(pos, quaternion.identity, scale));
            em.SetComponentData(city, new Building
            {
                Type         = BuildingType.CityState,
                RootHex      = cityHex,
                OwnerFaction = FactionType.Neutral,
            });
            em.SetComponentData(city, new BuildingVisual { Value = BuildingType.CityState });
            em.AddComponentData(city, new BuildingHealth { Value = CityMaxHp, Max = CityMaxHp });
            em.AddComponent<CityStateTag>(city);
            em.AddComponent<CityTag>(city);
            em.AddComponentData(city, new CityAdminRadius { Radius = 6 });
            em.AddBuffer<CityLedger>(city);
            em.AddComponentData(city, new CityStateStatus { Value = CityStateStatusValue.Neutral });
            em.AddComponentData(city, new CityStateDisposition
            {
                Mood            = StartingMood,
                DriftPerCadence = DriftPerCadence,
            });
            em.AddComponentData(city, new TerritoryEmitter
            {
                Center       = cityHex,
                Radius       = 3,
                OwnerFaction = FactionType.Neutral,
            });
            em.AddComponentData(city, new Faction { Value = FactionType.Neutral });

            PublishToast($"A city-state has been founded ({active + 1}/{MaxCityStates})", ToastKind.Info);
            _spawnCheckTimer = SpawnInterval;
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
