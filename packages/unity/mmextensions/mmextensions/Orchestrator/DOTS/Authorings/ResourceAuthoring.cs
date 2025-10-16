using Unity.Entities;
using UnityEngine;
using KBVE.MMExtensions.Orchestrator.DOTS.Common;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    public class ResourceAuthoring : MonoBehaviour
    {
        private class ResourceBaker : Baker<ResourceAuthoring>
        {
            public override void Bake(ResourceAuthoring authoring)
            {
                var entity = GetEntity(TransformUsageFlags.Dynamic);

                // Build flags
                var flags = ResourceFlags.None;
                if (authoring.IsHarvestable)
                    flags |= ResourceFlags.IsHarvestable;
                if (authoring.IsDepleted)
                    flags |= ResourceFlags.IsDepleted;

                // Create ResourceData with proper field names and types
                var resourceData = new ResourceData
                {
                    TemplateUlid = Ulid.ToBytes(authoring.ResourceULID),
                    Type = authoring.Type,
                    Flags = flags,
                    Amount = authoring.Amount,                  // Now int instead of ushort
                    MaxAmount = authoring.MaxAmount,            // Now int instead of ushort
                    HarvestYield = authoring.HarvestYield,      // Now int instead of ushort
                    HarvestTime = authoring.HarvestTime
                };

                // Add Resource component using implicit conversion
                AddComponent(entity, new Resource { Data = resourceData });

                // Add universal EntityComponent for hover/selection system
                // Generate unique ULID for this specific entity instance (directly as bytes)
                var entityData = new EntityData
                {
                    Ulid = Ulid.NewUlidAsBytes(),  // Unique ULID for this entity instance (no string allocation)
                    Type = EntityType.Resource | EntityType.Interactable | EntityType.Neutral,
                    ActionFlags = authoring.IsHarvestable ? EntityActionFlags.CanInteract : EntityActionFlags.None,
                    WorldPos = authoring.transform.position
                };
                AddComponent(entity, new EntityComponent { Data = entityData });

                AddComponent(entity, new ResourceID
                {
                    instanceUlid = Ulid.ToBytes(authoring.ResourceULID)  // Fixed field name
                });
                
                
            }
        }

        [Header("Resource Identity")]
        [Tooltip("ULID from the resource definition (e.g., 01JCKH7M9K2XQZW3P4R5S6T7V8)")]
        public string ResourceULID = "";

        [Header("Resource Type")]
        [Tooltip("What type of resource this is")]
        public ResourceType Type = ResourceType.Wood;

        [Header("Resource Amount")]
        [Tooltip("Current amount of resource available")]
        [Range(0, 65535)]
        public int Amount = 100;
        
        [Tooltip("Maximum amount this resource node can hold")]
        [Range(0, 65535)]
        public int MaxAmount = 100;

        [Header("Harvest Settings")]
        [Tooltip("Amount of resource gained per harvest action")]
        [Range(0, 65535)]
        public int HarvestYield = 1;
        
        [Tooltip("Time in seconds required to complete one harvest action")]
        [Min(0.1f)]
        public float HarvestTime = 2f;
        
        [Tooltip("Can this resource be harvested right now?")]
        public bool IsHarvestable = true;
        
        [Tooltip("Is this resource depleted/empty?")]
        public bool IsDepleted = false;

#if UNITY_EDITOR
        private void OnValidate()
        {
            // Ensure amount doesn't exceed max
            if (Amount > MaxAmount)
                Amount = MaxAmount;
            
            // Can't be depleted if it has amount
            if (Amount > 0 && IsDepleted)
                IsDepleted = false;
        }
#endif
    }
}