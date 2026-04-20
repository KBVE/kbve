using System.Threading;
using UnityEngine;
using VContainer;
using VContainer.Unity;
using Cysharp.Threading.Tasks;

namespace RareIcon
{
    /// <summary>
    /// First entry point, (runs after RootLifetimeScope finishes building, sets up locale, verifies Rust FFI, and prepares the game for play.
    /// </summary>
    public class TitleEntryPoint : IAsyncStartable
    {
        readonly LocaleService _locale;
        readonly InventoryService _inventory;
        readonly ChunkGeneratorService _chunkGenerator;
        readonly RiverRouter _riverRouter;

        [Inject]
        public TitleEntryPoint(
            LocaleService locale,
            InventoryService inventory,
            ChunkGeneratorService chunkGenerator,
            RiverRouter riverRouter)
        {
            _locale = locale;
            _inventory = inventory;
            _chunkGenerator = chunkGenerator;
            _riverRouter = riverRouter;
        }

        public async UniTask StartAsync(CancellationToken cancellation)
        {
            Debug.Log("[TitleEntryPoint] Booting...");
            _locale.SetLocale("en");
            Debug.Log($"[TitleEntryPoint] Locale set to '{_locale.CurrentLocale}'");
            var overflow = _inventory.Add(ItemId.HealthPotion, 3);
            var count = _inventory.Count(ItemId.HealthPotion);
            Debug.Log($"[TitleEntryPoint] FFI check — added 3 HealthPotion, overflow={overflow}, count={count}");
            _inventory.Remove(ItemId.HealthPotion, 3);
            HexChunkSystem.SetGenerator(_chunkGenerator);
            var rivers = await UniTask.RunOnThreadPool(
                () => _riverRouter.RouteRegion(new Unity.Mathematics.int2(0, 0), 200),
                cancellationToken: cancellation);
            RiverSpawnSystem.SetRivers(rivers);

            Debug.Log("[TitleEntryPoint] Ready.");
        }
    }
}
