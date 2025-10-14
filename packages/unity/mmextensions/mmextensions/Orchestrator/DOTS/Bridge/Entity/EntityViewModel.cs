using UniRx;
using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Bridge
{
    public class EntityViewModel : MonoBehaviour
    {
        public static EntityViewModel Instance { get; private set; }

        // Main reactive property
        public ReactiveProperty<EntityBlitContainer?> Current = new ReactiveProperty<EntityBlitContainer?>(null);

        // Convenience observables
        public IObservable<(EntityBlit entity, ResourceBlit resource)> OnResourceSelected => 
            Current
                .Where(c => c.HasValue && c.Value.HasResource)
                .Select(c => (c.Value.Entity, c.Value.Resource.Value));
        
        public IObservable<(EntityBlit entity, StructureBlit structure)> OnStructureSelected => 
            Current
                .Where(c => c.HasValue && c.Value.HasStructure)
                .Select(c => (c.Value.Entity, c.Value.Structure.Value));
        
        public IObservable<(EntityBlit entity, CombatantBlit combatant)> OnCombatantSelected => 
            Current
                .Where(c => c.HasValue && c.Value.HasCombatant)
                .Select(c => (c.Value.Entity, c.Value.Combatant.Value));

        void Awake()
        {
            if (Instance != null)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        void OnDestroy()
        {
            if (Instance == this)
                Instance = null;
        }
    }
}