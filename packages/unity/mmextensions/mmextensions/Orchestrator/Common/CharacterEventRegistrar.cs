using KBVE.MMExtensions.Orchestrator.Interfaces;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using MoreMountains.InventoryEngine;
using VContainer;
using VContainer.Unity;
using UnityEngine;
using Cysharp.Threading.Tasks;
using System.Threading;
using KBVE.MMExtensions.Orchestrator.Core.UI;
using KBVE.MMExtensions.Orchestrator.Health;

namespace KBVE.MMExtensions.Orchestrator.Core
{
    public class CharacterEventRegistrar : IAsyncStartable,
                                           MMEventListener<TopDownEngineEvent>
    {
        private readonly ICharacterRegistry _registry;
        private readonly IHUDService _hudService;

        // private const string PlayerID = "Player1"; - Removing the hardcoded ref to player1.

        [Inject]
        public CharacterEventRegistrar(ICharacterRegistry registry, IHUDService hudService)
        {
            _registry = registry;
            _hudService = hudService;
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
                    {
                        string playerId = evt.OriginCharacter?.PlayerID;

                        Character activeCharacter = null;

                        if (!string.IsNullOrEmpty(playerId))
                        {
                            _registry.TryGetPrimaryCharacter(playerId, out activeCharacter);
                        }

                        // Fallback if registry failed or playerId was missing
                        if (activeCharacter == null && LevelManager.HasInstance && LevelManager.Instance.Players.Count > 0)
                        {
                            activeCharacter = LevelManager.Instance.Players[0];
                            Debug.LogWarning("[CharacterEventRegistrar] Falling back to LevelManager.Instance.Players[0] as active character.");
                        }

                        if (activeCharacter == null)
                        {
                            Debug.LogWarning($"[CharacterEventRegistrar] No active character found for swap event.");
                            break;
                        }

                        var health = activeCharacter.GetComponent<ExtendedHealth>();
                        if (health != null)
                        {
                            _hudService.SetActiveStatsAsync(health.Stats).Forget();
                            Debug.Log($"[CharacterEventRegistrar] HUD updated for swapped-in character: {activeCharacter.name}");
                        }
                        else
                        {
                            Debug.LogWarning($"[CharacterEventRegistrar] Active character '{activeCharacter.name}' has no ExtendedHealth.");
                        }

                        break;
                    }
                default:
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
            var extendedHealth = character.GetComponent<ExtendedHealth>();
            if (extendedHealth != null)
            {
                _hudService.SetActiveStatsAsync(extendedHealth.Stats).Forget();
                Debug.Log($"[CharacterEventRegistrar] HUD stats set for PlayerID '{playerID}'");
            }
            else
            {
                Debug.LogWarning($"[CharacterEventRegistrar] No ExtendedHealth component found on '{character.name}' — HUD will not show stats.");
            }
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
