using System.Collections.Generic;
using Unity.Entities;
using Unity.Rendering;

namespace RareIcon
{
    /// <summary>Auto-shelters the idle King onto the Capital footprint (hidden + suspended) and processes UI-published ReleaseShelterRequest entities. Sheltered units keep their Entity + state; only render / movement / collision / command participation is paused.</summary>
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    public partial class ShelterSystem : SystemBase
    {
        readonly List<(Entity Unit, Entity Host)> _toShelter = new();
        readonly List<Entity>                     _toRelease = new();
        readonly List<Entity>                     _requests  = new();
        readonly List<Entity>                     _hosts     = new();

        protected override void OnUpdate()
        {
            ProcessReleases();
            AutoShelterKing();
        }

        void AutoShelterKing()
        {
            _toShelter.Clear();

            foreach (var (movement, goal, entity) in
                     SystemAPI.Query<RefRO<UnitMovement>, RefRO<MovementGoal>>()
                              .WithAll<KingTag, ControlledUnitTag>()
                              .WithNone<ShelteredInside>()
                              .WithEntityAccess())
            {
                if (goal.ValueRO.Kind != GoalKind.None) continue;
                if (!movement.ValueRO.CurrentHex.Equals(movement.ValueRO.TargetHex)) continue;

                if (SystemAPI.HasComponent<ShelterCooldown>(entity))
                {
                    var cd = SystemAPI.GetComponent<ShelterCooldown>(entity);
                    if (cd.WanderStepAtRelease == movement.ValueRO.WanderStep) continue;
                }

                if (!HexHoverSystem.TryGetHexEntity(movement.ValueRO.CurrentHex, out var tile)) continue;
                if (!SystemAPI.HasComponent<HexOccupant>(tile)) continue;

                var building = SystemAPI.GetComponent<HexOccupant>(tile).Building;
                if (building == Entity.Null) continue;
                if (!SystemAPI.HasComponent<CapitalTag>(building)) continue;

                _toShelter.Add((entity, building));
            }

            for (int i = 0; i < _toShelter.Count; i++)
            {
                var pair = _toShelter[i];
                EntityManager.AddComponentData(pair.Unit, new ShelteredInside { Host = pair.Host });
                EntityManager.AddComponent<DisableRendering>(pair.Unit);
            }
        }

        void ProcessReleases()
        {
            _requests.Clear();
            _toRelease.Clear();
            _hosts.Clear();

            foreach (var (req, reqEntity) in
                     SystemAPI.Query<RefRO<ReleaseShelterRequest>>().WithEntityAccess())
            {
                _requests.Add(reqEntity);
                _hosts.Add(req.ValueRO.Host);
            }

            if (_hosts.Count == 0) return;

            foreach (var (shelter, entity) in
                     SystemAPI.Query<RefRO<ShelteredInside>>().WithEntityAccess())
            {
                for (int i = 0; i < _hosts.Count; i++)
                {
                    if (shelter.ValueRO.Host == _hosts[i])
                    {
                        _toRelease.Add(entity);
                        break;
                    }
                }
            }

            for (int i = 0; i < _toRelease.Count; i++)
            {
                var unit = _toRelease[i];
                EntityManager.RemoveComponent<ShelteredInside>(unit);
                EntityManager.RemoveComponent<DisableRendering>(unit);

                uint step = EntityManager.GetComponentData<UnitMovement>(unit).WanderStep;
                var cd = new ShelterCooldown { WanderStepAtRelease = step };
                if (EntityManager.HasComponent<ShelterCooldown>(unit))
                    EntityManager.SetComponentData(unit, cd);
                else
                    EntityManager.AddComponentData(unit, cd);
            }
            for (int i = 0; i < _requests.Count; i++)
                EntityManager.DestroyEntity(_requests[i]);
        }
    }
}
