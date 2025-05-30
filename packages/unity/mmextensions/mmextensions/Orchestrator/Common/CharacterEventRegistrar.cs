using KBVE.MMExtensions.Orchestrator.Interfaces;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using MoreMountains.InventoryEngine;
using VContainer;
using VContainer.Unity;
using Cysharp.Threading.Tasks;
using System.Collections.Generic;

namespace KBVE.MMExtensions.Orchestrator.Core
{
    public class CharacterEventRegistrar : IStartable,
                                           MMEventListener<TopDownEngineEvent>,
                                           MMEventListener<MMInventoryEvent>
    {
        private readonly ICharacterRegistry _registry;
        private readonly HashSet<string> _inventoryLoaded = new();

        [Inject]
        public CharacterEventRegistrar(ICharacterRegistry registry)
        {
            _registry = registry;
        }

        public void Start()
        {
            MMEventManager.AddListener<TopDownEngineEvent>(this);
            MMEventManager.AddListener<MMInventoryEvent>(this);
        }

        public void OnMMEvent(TopDownEngineEvent evt)
        {
            if (evt.EventType == TopDownEngineEventTypes.SpawnComplete)
            {
                HandleCharacterSpawn(evt.OriginCharacter).Forget();
            }
        }

        public void OnMMEvent(MMInventoryEvent evt)
        {
            if (evt.InventoryEventType != MMInventoryEventType.InventoryLoaded || string.IsNullOrWhiteSpace(evt.PlayerID))
                return;

            _inventoryLoaded.Add(evt.PlayerID);

            if (_registry.GetCharacter(evt.PlayerID) is { } character)
            {
                var inventory = character.GetComponent<Inventory>() 
                             ?? character.GetComponentInChildren<Inventory>() 
                             ?? character.GetComponentInParent<Inventory>();

                if (inventory != null)
                {
                    _registry.RegisterInventory(evt.PlayerID, inventory);
                    UnityEngine.Debug.Log($"[CharacterEventRegistrar] Registered inventory for PlayerID: {evt.PlayerID}");
                }
            }
        }

        private async UniTaskVoid HandleCharacterSpawn(Character character)
        {
            if (character == null) return;

            await UniTask.NextFrame();

            var inventory = character.GetComponent<Inventory>() 
                         ?? character.GetComponentInChildren<Inventory>() 
                         ?? character.GetComponentInParent<Inventory>();

            if (inventory == null || string.IsNullOrWhiteSpace(inventory.PlayerID))
            {
                UnityEngine.Debug.LogWarning("[CharacterEventRegistrar] Character missing Inventory or PlayerID.");
                return;
            }

            if (!_registry.IsRegistered(inventory.PlayerID))
            {
                _registry.Register(inventory.PlayerID, character);
                UnityEngine.Debug.Log($"[CharacterEventRegistrar] Registered character {character.name} for PlayerID: {inventory.PlayerID}");
            }

            // If MMInventoryEvent.InventoryLoaded was received earlier, register inventory now
            if (_inventoryLoaded.Contains(inventory.PlayerID))
            {
                _registry.RegisterInventory(inventory.PlayerID, inventory);
                UnityEngine.Debug.Log($"[CharacterEventRegistrar] Registered inventory for PlayerID: {inventory.PlayerID} (deferred)");
            }
        }
    }
}
