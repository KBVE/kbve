using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>
    /// Ensures every <see cref="FarmTag"/> entity carries a default
    /// <see cref="FarmProduction"/> recipe. Lets BuildingSpawnSystem
    /// stay simple — spawn the building with FarmTag, this system fills
    /// in the production data on the next tick.
    ///
    /// V1 default: Compost → Carrot, 8s per cycle, 1:1 ratio. When
    /// recipe selection (e.g. Wood→Mushroom from a build menu) lands,
    /// BuildingSpawnSystem will attach FarmProduction explicitly with
    /// the chosen recipe and this auto-init becomes a no-op fallback.
    ///
    /// SystemBase (not Burst) because attaching a component is a
    /// structural change — cleanest with EntityManager on the main
    /// thread for once-per-farm-spawn frequency.
    /// </summary>
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial class FarmInitSystem : SystemBase
    {
        EntityQuery _needsInit;

        protected override void OnCreate()
        {
            _needsInit = GetEntityQuery(
                ComponentType.ReadOnly<FarmTag>(),
                ComponentType.Exclude<FarmProduction>());
        }

        protected override void OnUpdate()
        {
            if (_needsInit.IsEmpty) return;

            var arr = _needsInit.ToEntityArray(Allocator.Temp);
            try
            {
                for (int i = 0; i < arr.Length; i++)
                {
                    EntityManager.AddComponentData(arr[i], new FarmProduction
                    {
                        InputItemId   = (ushort)ItemId.Compost,
                        InputAmount   = 1,
                        OutputItemId  = (ushort)ItemId.Carrot,
                        OutputAmount  = 1,
                        CycleEndsAt   = 0f,        // idle until first input pull
                        CycleDuration = 8f,
                    });
                }
            }
            finally
            {
                arr.Dispose();
            }
        }
    }
}
