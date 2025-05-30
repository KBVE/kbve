using KBVE.MMExtensions.Orchestrator.Interfaces;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using MoreMountains.InventoryEngine;
using VContainer;
using VContainer.Unity;
using Cysharp.Threading.Tasks;


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
                HandleCharacterSpawn(evt.OriginCharacter).Forget();
            }
        }
         private async UniTaskVoid HandleCharacterSpawn(Character character)
        {
            if (character == null) return;

            // Optional delay to ensure Inventory is initialized
            await UniTask.Delay(1); // 1 frame delay

            var inventory = character.GetComponent<Inventory>() 
                ?? character.GetComponentInChildren<Inventory>()
                ?? character.GetComponentInParent<Inventory>();

            if (inventory == null || string.IsNullOrWhiteSpace(inventory.PlayerID))
            {
                UnityEngine.Debug.LogWarning("[CharacterEventRegistrar] Character missing Inventory or PlayerID.");
                return;
            }

            if (_registry.IsRegistered(inventory.PlayerID))
            {
                return;
            }

            _registry.Register(inventory.PlayerID, character);
            UnityEngine.Debug.Log($"[CharacterEventRegistrar] Registered character {character.name} for PlayerID: {inventory.PlayerID}");
        }
    }


    
}
