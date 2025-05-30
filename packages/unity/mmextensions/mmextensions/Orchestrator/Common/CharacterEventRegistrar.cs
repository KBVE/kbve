using KBVE.MMExtensions.Orchestrator.Interfaces;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using MoreMountains.InventoryEngine;
using VContainer;
using VContainer.Unity;

namespace KBVE.MMExtensions.Orchestrator.Core
{
    public class CharacterEventRegistrar : IStartable, MMEventListener<TopDownEngineEvent>
    {
        private readonly ICharacterRegistry _registry;

        [Inject]
        public CharacterEventRegistrar(ICharacterRegistry registry)
        {
            _registry = registry;
        }

        public void Start()
        {
            MMEventManager.AddListener<TopDownEngineEvent>(this);
        }

        public void OnMMEvent(TopDownEngineEvent evt)
        {
            if (evt.EventType == TopDownEngineEventTypes.SpawnComplete)
            {
                var character = evt.OriginCharacter;
                if (character == null) return;

                var inventory = character.GetComponentInChildren<Inventory>();
                if (inventory == null || string.IsNullOrWhiteSpace(inventory.PlayerID))
                {
                    UnityEngine.Debug.LogWarning("[CharacterEventRegistrar] Character missing Inventory or PlayerID.");
                    return;
                }

                _registry.Register(inventory.PlayerID, character);

                UnityEngine.Debug.Log($"[CharacterEventRegistrar] Registered character {character.name} for PlayerID: {inventory.PlayerID}");
            }
        }
    }
}
