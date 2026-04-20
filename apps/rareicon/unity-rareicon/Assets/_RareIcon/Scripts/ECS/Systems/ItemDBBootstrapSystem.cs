using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>One-shot managed bootstrap that builds a Burst-safe Mirror of the managed ItemDB table. Copies every ItemDef into a NativeHashMap&lt;ushort, ItemDefRuntime&gt; (strings omitted — not Burst-safe) and stamps it into an ItemDBSingleton. Consumers (JobSystem.capitalHasFood, ConsumeFoodExecutor, future arrow / potion logic) read via SystemAPI.GetSingleton&lt;ItemDBSingleton&gt;() and call IsEdible / EnergyValue / HealthValue directly from inside Burst jobs. Disposes the map in OnDestroy so the persistent allocation never leaks across world reloads.</summary>
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial class ItemDBBootstrapSystem : SystemBase
    {
        Entity _singletonEntity;
        bool   _initialized;

        protected override void OnUpdate()
        {
            if (_initialized) return;

            var lookup = new NativeHashMap<ushort, ItemDefRuntime>(128, Allocator.Persistent);
            ItemDB.PopulateRuntimeLookup(lookup);

            _singletonEntity = EntityManager.CreateEntity(typeof(ItemDBSingleton));
            EntityManager.SetComponentData(_singletonEntity, new ItemDBSingleton { Lookup = lookup });
            _initialized = true;
        }

        protected override void OnDestroy()
        {
            if (!_initialized) return;
            if (!EntityManager.Exists(_singletonEntity)) return;

            var s = EntityManager.GetComponentData<ItemDBSingleton>(_singletonEntity);
            if (s.Lookup.IsCreated) s.Lookup.Dispose();
        }
    }
}
