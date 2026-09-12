using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial class ItemDBBootstrapSystem : SystemBase
    {
        Entity _itemDbEntity;
        Entity _dietEntity;
        bool   _initialized;

        protected override void OnUpdate()
        {
            if (_initialized) return;

            ushort maxId    = (ushort)(ItemDB.GetMaxItemId() + 1);
            int    bitWords = (maxId + 63) >> 6;

            var defs       = new NativeArray<ItemDefRuntime>(maxId, Allocator.Persistent);
            var validBits  = new NativeArray<ulong>(bitWords, Allocator.Persistent);
            var edibleBits = new NativeArray<ulong>(bitWords, Allocator.Persistent);
            var foodBits   = new NativeArray<ulong>(bitWords, Allocator.Persistent);
            var perishBits = new NativeArray<ulong>(bitWords, Allocator.Persistent);
            ItemDB.PopulateRuntimeLookup(defs, validBits, edibleBits, foodBits, perishBits);

            _itemDbEntity = EntityManager.CreateEntity(typeof(ItemDBSingleton));
            EntityManager.SetComponentData(_itemDbEntity, new ItemDBSingleton
            {
                Defs           = defs,
                ValidBits      = validBits,
                EdibleBits     = edibleBits,
                FoodPoolBits   = foodBits,
                PerishableBits = perishBits,
                MaxItemId      = maxId,
            });

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
                if (s.Defs.IsCreated)           s.Defs.Dispose();
                if (s.ValidBits.IsCreated)      s.ValidBits.Dispose();
                if (s.EdibleBits.IsCreated)     s.EdibleBits.Dispose();
                if (s.FoodPoolBits.IsCreated)   s.FoodPoolBits.Dispose();
                if (s.PerishableBits.IsCreated) s.PerishableBits.Dispose();
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
