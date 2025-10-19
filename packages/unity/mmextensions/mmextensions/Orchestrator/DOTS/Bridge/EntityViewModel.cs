using R3;
using System;
using Unity.Collections;
using KBVE.MMExtensions.Orchestrator.DOTS;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Bridge
{
    /// <summary>
    /// Thread-safe reactive view model for the currently selected entity.
    /// This bridges ECS → main thread → OneJS/TS UI.
    /// </summary>
    public sealed class EntityViewModel : IDisposable
    {
        public static EntityViewModel Instance { get; private set; }

        // Thread-safe reactive property for multi-threaded access (non-nullable for Burst compatibility)
        public SynchronizedReactiveProperty<EntityBlitContainer> Current = new SynchronizedReactiveProperty<EntityBlitContainer>(default);

        // Track the ULID of the currently selected entity for cache updates
        private FixedBytes16 _selectedEntityUlid;
        private bool _hasSelection;

        public EntityViewModel() => Instance = this;

        /// <summary>
        /// Set the currently selected entity.
        /// This will update from cache data in subsequent UpdateFromCache calls.
        /// </summary>
        public void SetSelection(EntityBlitContainer entity)
        {
            _selectedEntityUlid = entity.EntityData.Ulid;
            _hasSelection = true;
            Current.Value = entity;
        }

        /// <summary>
        /// Clear the current selection.
        /// </summary>
        public void ClearSelection()
        {
            _hasSelection = false;
            _selectedEntityUlid = default;
            Current.Value = default;
        }

        /// <summary>
        /// Update the view model from cache data.
        /// Called by EntityCacheDrainSystem each frame with all cached entities.
        /// If an entity in the cache matches the currently selected entity ULID,
        /// updates the Current reactive property with fresh data.
        /// </summary>
        /// <param name="cacheData">Array of cached entity data</param>
        /// <param name="count">Number of valid entries in the cache</param>
        public static void UpdateFromCache(EntityBlitContainer[] cacheData, int count)
        {
            // Fast path: no selection or no cache data
            if (Instance == null || !Instance._hasSelection || count == 0)
                return;

            var selectedUlid = Instance._selectedEntityUlid;

            // Search cache for selected entity
            for (int i = 0; i < count; i++)
            {
                ref readonly var cached = ref cacheData[i];

                // Check if this cached entity matches our selection
                if (UlidEquals(cached.EntityData.Ulid, selectedUlid))
                {
                    // Update reactive property with fresh data from cache
                    Instance.Current.Value = cached;
                    return; // Found and updated - early exit
                }
            }

            // If we reach here, selected entity was not in cache
            // This could mean:
            // 1. Entity was destroyed
            // 2. Entity didn't change this frame (change filter)
            // 3. Entity is out of range/not being tracked
            //
            // We don't clear the selection here - keep last known state
            // The UI can decide if it wants to show stale data or clear on timeout
        }

        /// <summary>
        /// Compare two FixedBytes16 ULIDs for equality.
        /// Uses unsafe comparison for maximum performance.
        /// </summary>
        private static unsafe bool UlidEquals(FixedBytes16 a, FixedBytes16 b)
        {
            // Compare as two 64-bit values for speed (16 bytes = 2 x 8 bytes)
            long* ptrA = (long*)&a;
            long* ptrB = (long*)&b;
            return ptrA[0] == ptrB[0] && ptrA[1] == ptrB[1];
        }

        /// <summary>
        /// Release any subscriptions (if container disposes this singleton).
        /// </summary>
        public void Dispose()
        {
            Current.Dispose();
        }
    }
}