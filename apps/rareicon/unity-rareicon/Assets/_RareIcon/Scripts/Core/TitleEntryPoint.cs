using System.Threading;
using UnityEngine;
using VContainer;
using VContainer.Unity;
using Cysharp.Threading.Tasks;

namespace RareIcon
{
    /// <summary>
    /// First entry point — runs after RootLifetimeScope finishes building.
    /// Sets up locale, verifies Rust FFI, and prepares the game for play.
    /// </summary>
    public class TitleEntryPoint : IAsyncStartable
    {
        readonly LocaleService _locale;
        readonly InventoryService _inventory;
        readonly ChunkGeneratorService _chunkGenerator;

        [Inject]
        public TitleEntryPoint(LocaleService locale, InventoryService inventory, ChunkGeneratorService chunkGenerator)
        {
            _locale = locale;
            _inventory = inventory;
            _chunkGenerator = chunkGenerator;
        }

        public async UniTask StartAsync(CancellationToken cancellation)
        {
            Debug.Log("[TitleEntryPoint] Booting...");

            // Set default locale
            _locale.SetLocale("en");
            Debug.Log($"[TitleEntryPoint] Locale set to '{_locale.CurrentLocale}'");

            // Verify Rust FFI is alive
            var overflow = _inventory.Add(ItemId.HealthPotion, 3);
            var count = _inventory.Count(ItemId.HealthPotion);
            Debug.Log($"[TitleEntryPoint] FFI check — added 3 HealthPotion, overflow={overflow}, count={count}");

            // Clean up the test items
            _inventory.Remove(ItemId.HealthPotion, 3);

            // Wire chunk generator to ECS system
            HexChunkSystem.SetGenerator(_chunkGenerator);

            Debug.Log("[TitleEntryPoint] Ready.");

            await UniTask.CompletedTask;
        }
    }
}
