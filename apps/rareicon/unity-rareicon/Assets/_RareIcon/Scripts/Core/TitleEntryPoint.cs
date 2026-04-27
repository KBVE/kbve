using System.Threading;
using UnityEngine;
using VContainer;
using VContainer.Unity;
using Cysharp.Threading.Tasks;

namespace RareIcon
{
    /// <summary>App bootstrap entry point. Verifies the inventory FFI is reachable and leaves the app in <see cref="AppInterfaceState.MainMenu"/> for <see cref="UITitleScreen"/> to take over. World generation (river routing + chunk streaming) is gated on the player picking a seed via <see cref="WorldGenSession"/>; nothing else should kick that off here.</summary>
    public class TitleEntryPoint : IAsyncStartable
    {
        readonly InventoryService _inventory;

        [Inject]
        public TitleEntryPoint(InventoryService inventory)
        {
            _inventory = inventory;
        }

        public UniTask StartAsync(CancellationToken cancellation)
        {
            Debug.Log("[TitleEntryPoint] Booting...");
            var overflow = _inventory.Add(ItemId.Potion, 3);
            var count = _inventory.Count(ItemId.Potion);
            Debug.Log($"[TitleEntryPoint] FFI check — added 3 Potion, overflow={overflow}, count={count}");
            _inventory.Remove(ItemId.Potion, 3);
            Debug.Log("[TitleEntryPoint] Ready — title screen takes over.");
            return UniTask.CompletedTask;
        }
    }
}
