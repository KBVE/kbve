using UnityEngine;
using KBVE.MMExtensions.Orchestrator.Interfaces;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using MoreMountains.InventoryEngine;
using VContainer;

namespace KBVE.MMExtensions.Orchestrator.Core
{
    public class CharacterEventRegistrar : MonoBehaviour, MMEventListener<TopDownEngineEvent>
    {
        [Inject] private ICharacterRegistry _registry;

        private void OnEnable()
        {
            this.MMEventStartListening<TopDownEngineEvent>();
        }

        private void OnDisable()
        {
            this.MMEventStopListening<TopDownEngineEvent>();
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
                    Debug.LogWarning("[CharacterEventRegistrar] Character missing Inventory or PlayerID.");
                    return;
                }

                _registry.Register(inventory.PlayerID, character);
                // inventory.SetOwner(character.gameObject);

                Debug.Log($"[CharacterEventRegistrar] Registered character {character.name} for PlayerID: {inventory.PlayerID}");
            }
        }
    }
}
