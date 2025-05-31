using KBVE.MMExtensions.Orchestrator.Interfaces;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using MoreMountains.InventoryEngine;
using VContainer;
using VContainer.Unity;
using UnityEngine;
using Cysharp.Threading.Tasks;
using System.Threading;

namespace KBVE.MMExtensions.Orchestrator.Core
{
    public class CharacterEventRegistrar : IAsyncStartable,
                                           MMEventListener<TopDownEngineEvent>
    {
        private readonly ICharacterRegistry _registry;
        // private const string PlayerID = "Player1"; - Removing the hardcoded ref to player1.

        [Inject]
        public CharacterEventRegistrar(ICharacterRegistry registry)
        {
            _registry = registry;
        }


        public async UniTask StartAsync(CancellationToken cancellation)
        {
            MMEventManager.AddListener<TopDownEngineEvent>(this);

            await UniTask.NextFrame(cancellation); // Delay one frame to allow scene objects to initialize
            await ScanAndRegisterAllCharacters(cancellation);  // Optional: scan characters already active
        }

        public void OnMMEvent(TopDownEngineEvent evt)
        {
            switch (evt.EventType)
            {
                case TopDownEngineEventTypes.SpawnComplete:
                    HandleSpawnComplete(evt);
                    break;

                case TopDownEngineEventTypes.LevelStart:
                    ScanAndRegisterAllCharacters(CancellationToken.None).Forget(); // Since MMEvnts are not async, fire+forget.

                    Debug.Log("[CharacterEventRegistrar] Level Start Triggered");
                    break;

                case TopDownEngineEventTypes.CharacterSwap:
                    Debug.Log("[CharacterEventRegistrar] Character Swap Detected");
                    break;
            }
        }

        private void HandleSpawnComplete(TopDownEngineEvent evt)
        {
            var character = evt.OriginCharacter;
            if (character == null)
            {
                Debug.LogWarning("[CharacterEventRegistrar] SpawnComplete event had null origin character.");
                return;
            }

            var swap = character.GetComponent<CharacterSwap>();
            string playerID;

            if (swap != null && !string.IsNullOrWhiteSpace(swap.PlayerID))
            {
                playerID = swap.PlayerID;
            }
            else
            {
                Debug.LogError($"[CharacterEventRegistrar] Character '{character.name}' is missing a valid CharacterSwap.PlayerID. Falling back to 'Player1'.");
                playerID = "Player1";
            }

            Debug.Log($"[CharacterEventRegistrar] SpawnComplete received. Character: {character.name} (PlayerID: {playerID})");

            // Register the character (even if multiple for same PlayerID)
            _registry.Register(playerID, character);
            Debug.Log($"[CharacterEventRegistrar] Registered Character '{character.name}' to PlayerID '{playerID}'");

            // Only register inventory if not already present
            if (!_registry.TryGetInventory(playerID, out _))
            {
                var inventory = FindInventoryByPlayerID(playerID);
                if (inventory != null)
                {
                    _registry.RegisterInventory(playerID, inventory);
                    Debug.Log($"[CharacterEventRegistrar] Registered Inventory for PlayerID: {playerID}");
                }
                else
                {
                    Debug.LogWarning($"[CharacterEventRegistrar] No Inventory found for PlayerID: {playerID}");
                }
            }
        }

        private async UniTask ScanAndRegisterAllCharacters(CancellationToken cancellation)
        {
            var characters = UnityEngine.Object.FindObjectsByType<Character>(FindObjectsSortMode.None);

            foreach (var character in characters)
            {
                cancellation.ThrowIfCancellationRequested();

                var swap = character.GetComponent<CharacterSwap>();
                if (swap == null || string.IsNullOrWhiteSpace(swap.PlayerID))
                {
                    Debug.Log($"[CharacterEventRegistrar] Skipping non-player character '{character.name}'");
                    continue;
                }

                var playerID = swap.PlayerID;

                // Only register if this character is not already in the registry
                if (_registry.TryGetCharacters(playerID, out var existingList) &&
                    existingList.Contains(character))
                {
                    Debug.Log($"[CharacterEventRegistrar] Character '{character.name}' already registered under PlayerID '{playerID}' — skipping.");
                    continue;
                }

                _registry.Register(playerID, character);
                Debug.Log($"[CharacterEventRegistrar] Auto-Registered Character '{character.name}' (PlayerID: {playerID})");

                // Only register inventory if not already present
                if (!_registry.TryGetInventory(playerID, out _))
                {
                    var inventory = FindInventoryByPlayerID(playerID);
                    if (inventory != null)
                    {
                        _registry.RegisterInventory(playerID, inventory);
                        Debug.Log($"[CharacterEventRegistrar] Auto-Registered Inventory for PlayerID: {playerID}");
                    }
                }
            }

            await UniTask.Yield();
        }
        
        private Inventory FindInventoryByPlayerID(string playerID)
        {
            foreach (var inv in UnityEngine.Object.FindObjectsByType<Inventory>(FindObjectsSortMode.None))
            {
                if (inv != null && inv.PlayerID == playerID)
                    return inv;
            }
            return null;
        }
    }
}
