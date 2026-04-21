using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>One-shot managed bootstrap that builds a Burst-safe Mirror of the managed ItemDB table. Copies every ItemDef into a NativeHashMap&lt;ushort, ItemDefRuntime&gt; (strings omitted — not Burst-safe) and stamps it into an ItemDBSingleton. Consumers (JobSystem.capitalHasFood, ConsumeFoodExecutor, future arrow / potion logic) read via SystemAPI.GetSingleton&lt;ItemDBSingleton&gt;() and call IsEdible / EnergyValue / HealthValue directly from inside Burst jobs. Disposes the map in OnDestroy so the persistent allocation never leaks across world reloads.</summary>
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial class ItemDBBootstrapSystem : SystemBase
    {
        Entity _itemDbEntity;
        Entity _dietEntity;
        bool   _initialized;

        protected override void OnUpdate()
        {
            if (_initialized) return;

            var itemLookup = new NativeHashMap<ushort, ItemDefRuntime>(128, Allocator.Persistent);
            ItemDB.PopulateRuntimeLookup(itemLookup);
            _itemDbEntity = EntityManager.CreateEntity(typeof(ItemDBSingleton));
            EntityManager.SetComponentData(_itemDbEntity, new ItemDBSingleton { Lookup = itemLookup });

            var dietLookup = new NativeHashMap<uint, byte>(64, Allocator.Persistent);
            _dietEntity = EntityManager.CreateEntity(typeof(DietPreferencesSingleton));
            EntityManager.SetComponentData(_dietEntity, new DietPreferencesSingleton { Overrides = dietLookup });
            DietPreferencesStore.BindNativeMirror(dietLookup);

            _initialized = true;
        }

        protected override void OnDestroy()
        {
            if (!_initialized) return;
            if (EntityManager.Exists(_itemDbEntity))
            {
                var s = EntityManager.GetComponentData<ItemDBSingleton>(_itemDbEntity);
                if (s.Lookup.IsCreated) s.Lookup.Dispose();
            }
            if (EntityManager.Exists(_dietEntity))
            {
                var d = EntityManager.GetComponentData<DietPreferencesSingleton>(_dietEntity);
                if (d.Overrides.IsCreated) d.Overrides.Dispose();
            }
            DietPreferencesStore.BindNativeMirror(default);
        }
    }
}
