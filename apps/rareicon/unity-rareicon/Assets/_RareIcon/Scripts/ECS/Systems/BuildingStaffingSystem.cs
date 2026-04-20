using System.Collections.Generic;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>When a building finishes (NeedsStaffing tag), promotes one pure-Looter goblin by stacking the matching specialty role at priority 5 on top of their existing Looter. Capital→Builder, Farm→Farmer, Barracks→Archer, Furnace→Chef. Unspecialized means Looter>0 and every other role==0 — already-promoted goblins are skipped so buildings don't poach dedicated workers. If no candidate exists, the tag persists for a future retry.</summary>
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    public partial class BuildingStaffingSystem : SystemBase
    {
        const byte SpecialtyPriority = 5;

        readonly List<(Entity Building, byte Role)> _toStaff = new();

        protected override void OnUpdate()
        {
            _toStaff.Clear();

            foreach (var (building, entity) in
                     SystemAPI.Query<RefRO<Building>>()
                              .WithAll<NeedsStaffing>()
                              .WithNone<ConstructionSite>()
                              .WithEntityAccess())
            {
                byte role = RoleForBuilding(building.ValueRO.Type);
                if (role == JobKind.None) { EntityManager.RemoveComponent<NeedsStaffing>(entity); continue; }
                _toStaff.Add((entity, role));
            }

            if (_toStaff.Count == 0) return;

            using var query = EntityManager.CreateEntityQuery(
                ComponentType.ReadOnly<Unit>(),
                ComponentType.ReadWrite<JobPriorities>());
            using var candidates = query.ToEntityArray(Allocator.Temp);

            for (int i = 0; i < _toStaff.Count; i++)
            {
                var buildingEntity = _toStaff[i].Building;
                var role           = _toStaff[i].Role;

                Entity chosen = Entity.Null;
                for (int c = 0; c < candidates.Length; c++)
                {
                    var cand = candidates[c];
                    var prios = EntityManager.GetComponentData<JobPriorities>(cand);
                    if (!IsPureLooter(prios)) continue;
                    chosen = cand;
                    break;
                }

                if (chosen == Entity.Null) continue;

                var existing = EntityManager.GetComponentData<JobPriorities>(chosen);
                existing.Set(role, SpecialtyPriority);
                EntityManager.SetComponentData(chosen, existing);
                EntityManager.RemoveComponent<NeedsStaffing>(buildingEntity);
            }
        }

        static byte RoleForBuilding(byte buildingType) => buildingType switch
        {
            BuildingType.Capital  => JobKind.Builder,
            BuildingType.Farm     => JobKind.Farmer,
            BuildingType.Barracks => JobKind.Guard,
            BuildingType.Furnace  => JobKind.Chef,
            _                     => JobKind.None,
        };

        static bool IsPureLooter(in JobPriorities p)
        {
            if (p.Looter == 0) return false;
            return p.Lumberjack == 0
                && p.Miner      == 0
                && p.Guard      == 0
                && p.Farmer     == 0
                && p.Builder    == 0
                && p.Chef       == 0
                && p.Hunter     == 0;
        }
    }
}
