using KBVE.MMExtensions.Orchestrator.Interfaces;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using MoreMountains.InventoryEngine;
using VContainer;
using VContainer.Unity;
using UnityEngine;
using Cysharp.Threading.Tasks;
using System;
using System.Threading;
using System.Collections.Generic;
using KBVE.MMExtensions.Ai;
using KBVE.MMExtensions.Orchestrator.Core.UI;
using KBVE.MMExtensions.Orchestrator.Health;

namespace KBVE.MMExtensions.Orchestrator.Core
{
    public class CharacterEventRegistrar : IAsyncStartable,
                                           IDisposable,
                                           MMEventListener<TopDownEngineEvent>
    {
        private readonly ICharacterRegistry _registry;
        private readonly IHUDService _hudService;

        private bool _eventSubscribed = false;


        [Inject]
        public CharacterEventRegistrar(ICharacterRegistry registry, IHUDService hudService)
        {
            _registry = registry;
            _hudService = hudService;
        }

        public async UniTask StartAsync(CancellationToken cancellation)
        {
            // MMEventManager.AddListener<TopDownEngineEvent>(this);

            if (!_eventSubscribed)
            {
                MMEventManager.AddListener<TopDownEngineEvent>(this);
                _eventSubscribed = true;
            }

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
                    DelayHUDUpdate().Forget();
                    break;

                case TopDownEngineEventTypes.CharacterSwap:
                    SetHUDStatsForActiveCharacter().Forget();
                    var playerId = UnityEngine.GameObject.FindFirstObjectByType<CharacterSwapManager>().PlayerID;
                    _registry.TryGetPrimaryCharacter(playerId, out Character activeCharacter);
                    _registry.TryGetCharacters(playerId, out List<Character> characters);
                    characters.ForEach(x => x.GetComponent<AiAllyBrain>().ToggleAI(!x.GetComponent<CharacterSwap>().Current()));
                    break;
                    

                default:
                    break;
            }
        }

        private void HandleSpawnComplete(TopDownEngineEvent evt)
        {
            var character = evt.OriginCharacter;
            if (character == null)
            {
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
            _registry.Register(playerID, character);            // Register the character (even if multiple for same PlayerID)

            SetHUDStatsForActiveCharacter().Forget();

            if (!_registry.TryGetInventory(playerID, out _))
            {
                var inventory = FindInventoryByPlayerID(playerID);
                if (inventory != null)
                {
                    _registry.RegisterInventory(playerID, inventory);
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
                    continue;
                }

                var playerID = swap.PlayerID;

                if (_registry.TryGetCharacters(playerID, out var existingList) &&
                    existingList.Contains(character))
                {
                    continue;
                }

                _registry.Register(playerID, character);

                if (!_registry.TryGetInventory(playerID, out _))
                {
                    var inventory = FindInventoryByPlayerID(playerID);
                    if (inventory != null)
                    {
                        _registry.RegisterInventory(playerID, inventory);
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

        // * Helper Methods

        private async UniTaskVoid DelayHUDUpdate()
        {
            await UniTask.DelayFrame(2);
            await Operator.R();
            await UniTask.WaitUntil(() =>
                _hudService != null &&
                LevelManager.HasInstance &&
                LevelManager.Instance.Players.Count > 0 &&
                LevelManager.Instance.Players[0] != null &&
                LevelManager.Instance.Players[0].GetComponent<ExtendedHealth>() != null

            );

            var character = LevelManager.Instance.Players[0];
            var health = character.GetComponent<ExtendedHealth>();

            if (_hudService == null || health == null)
            {
                Debug.LogWarning("[CharacterEventRegistrar] HUDService or ExtendedHealth not ready — skipping HUD update.");
                return;
            }

            await _hudService.SetActiveStatsAsync(health.Stats);
            Debug.Log($"[CharacterEventRegistrar] Delayed HUD update applied for character: {character.name}");
        }

        private async UniTask SetHUDStatsForActiveCharacter(CancellationToken cancellation = default)
        {
            await UniTask.WaitUntil(() =>
                LevelManager.HasInstance &&
                LevelManager.Instance.Players.Count > 0 &&
                LevelManager.Instance.Players[0] != null &&
                LevelManager.Instance.Players[0].GetComponent<ExtendedHealth>() != null,
                cancellationToken: cancellation);

            var character = LevelManager.Instance.Players[0];
            var health = character.GetComponent<ExtendedHealth>();

            if (_hudService == null)
            {
                Debug.LogWarning("[CharacterEventRegistrar] HUDService not available.");
                return;
            }

            await _hudService.SetActiveStatsAsync(health.Stats).AttachExternalCancellation(cancellation);
            Debug.Log($"[CharacterEventRegistrar] HUD bound to active character: {character.name}");
        }


        public void Dispose()
        {
            if (_eventSubscribed)
            {
                    MMEventManager.RemoveListener<TopDownEngineEvent>(this);
                    _eventSubscribed = false;
            }
        }

    }
}
