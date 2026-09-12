using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Attaches <see cref="UnitAttributes"/> to any unit missing it — rolled from the NPCDB base (±20%) off the
    /// unit's RandomState seed. One place covers every spawn path; persistence-restored units already carry the component
    /// (set during rehydrate) and are skipped. SystemBase because NPCDB.Get reads the managed NpcdbCache (not Burst).</summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial class UnitAttributeBackfillSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            var ecb = new EntityCommandBuffer(Allocator.Temp);
            foreach (var (unit, movement, e) in
                     SystemAPI.Query<RefRO<Unit>, RefRO<UnitMovement>>()
                              .WithNone<UnitAttributes>()
                              .WithEntityAccess())
            {
                var def = NPCDB.Get(unit.ValueRO.Type);
                ecb.AddComponent(e, AttributeRoll.Roll(def, movement.ValueRO.RandomState | 1u));
            }
            ecb.Playback(EntityManager);
            ecb.Dispose();
        }
    }
}
