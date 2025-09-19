using Unity.Entities;
using Unity.Transforms;
using UnityEngine;
using System.Collections.Generic;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{
    /// <summary>
    /// Simple hybrid system that creates GameObjects for ECS entities
    /// This is a temporary solution until we get pure ECS rendering working
    /// </summary>
    [UpdateInGroup(typeof(PresentationSystemGroup))]
    public partial class SimpleVisualizationSystem : SystemBase
    {
        private Dictionary<Entity, GameObject> _entityGameObjects;
        private GameObject _containerParent;

        protected override void OnCreate()
        {
            _entityGameObjects = new Dictionary<Entity, GameObject>();

            // Create a parent object to organize the visualization GameObjects
            _containerParent = new GameObject("DOTS Minion Visualizations");
            Object.DontDestroyOnLoad(_containerParent);
        }

        protected override void OnUpdate()
        {
            var gameObjects = _entityGameObjects;
            var parent = _containerParent;

            // Create GameObjects for entities that need visualization
            var createQuery = GetEntityQuery(
                ComponentType.ReadOnly<LocalToWorld>(),
                ComponentType.ReadOnly<NeedsVisualization>(),
                ComponentType.ReadOnly<MinionData>(),
                ComponentType.Exclude<HasVisualization>()
            );

            var entities = createQuery.ToEntityArray(Unity.Collections.Allocator.Temp);
            var transforms = createQuery.ToComponentDataArray<LocalToWorld>(Unity.Collections.Allocator.Temp);
            var visualizations = createQuery.ToComponentDataArray<NeedsVisualization>(Unity.Collections.Allocator.Temp);

            for (int i = 0; i < entities.Length; i++)
            {
                var entity = entities[i];
                var transform = transforms[i];
                var viz = visualizations[i];

                if (!viz.IsVisualized)
                {
                    // Create a simple GameObject
                    var go = CreateMinionGameObject(viz.VisualType, transform.Position);
                    go.transform.SetParent(parent.transform);

                    // Store the GameObject reference in our dictionary
                    gameObjects[entity] = go;

                    // Mark as visualized
                    EntityManager.SetComponentData(entity, new NeedsVisualization
                    {
                        VisualType = viz.VisualType,
                        IsVisualized = true
                    });

                    // Add tag component to mark this entity as having visualization
                    EntityManager.AddComponentData(entity, new HasVisualization());

                    Debug.Log($"[SimpleVisualization] Created visualization for {viz.VisualType} at {transform.Position}");
                }
            }

            entities.Dispose();
            transforms.Dispose();
            visualizations.Dispose();

            // Update positions of existing GameObjects
            var updateQuery = GetEntityQuery(
                ComponentType.ReadOnly<LocalToWorld>(),
                ComponentType.ReadOnly<HasVisualization>()
            );

            var updateEntities = updateQuery.ToEntityArray(Unity.Collections.Allocator.Temp);
            var updateTransforms = updateQuery.ToComponentDataArray<LocalToWorld>(Unity.Collections.Allocator.Temp);

            for (int i = 0; i < updateEntities.Length; i++)
            {
                var entity = updateEntities[i];
                var transform = updateTransforms[i];

                // Look up the GameObject in our dictionary
                if (gameObjects.TryGetValue(entity, out GameObject go))
                {
                    if (go != null)
                    {
                        go.transform.position = transform.Position;
                        go.transform.rotation = transform.Rotation;
                    }
                    else
                    {
                        // GameObject was destroyed externally, clean up
                        gameObjects.Remove(entity);
                        EntityManager.RemoveComponent<HasVisualization>(entity);
                    }
                }
            }

            updateEntities.Dispose();
            updateTransforms.Dispose();

            // Clean up GameObjects for destroyed entities
            var entitiesToRemove = new List<Entity>();
            foreach (var kvp in _entityGameObjects)
            {
                if (!EntityManager.Exists(kvp.Key))
                {
                    if (kvp.Value != null)
                    {
                        Object.Destroy(kvp.Value);
                    }
                    entitiesToRemove.Add(kvp.Key);
                }
            }

            foreach (var entity in entitiesToRemove)
            {
                _entityGameObjects.Remove(entity);
            }
        }

        private GameObject CreateMinionGameObject(MinionType type, Vector3 position)
        {
            // Create a simple colored cube/quad for visualization
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = $"Minion_{type}";
            go.transform.position = position;
            go.transform.localScale = Vector3.one * 0.8f; // Make it a bit smaller

            // Remove the collider since we don't need physics
            var collider = go.GetComponent<Collider>();
            if (collider != null)
            {
                Object.DestroyImmediate(collider);
            }

            // Set color based on minion type
            var renderer = go.GetComponent<Renderer>();
            if (renderer != null)
            {
                var material = new Material(Shader.Find("Unlit/Color") ?? Shader.Find("Standard"));
                material.color = GetColorForType(type);
                renderer.material = material;
            }

            return go;
        }

        private Color GetColorForType(MinionType type)
        {
            return type switch
            {
                MinionType.Tank => Color.red,      // Red for Tank/Zombie
                MinionType.Fast => Color.green,    // Green for Fast
                MinionType.Ranged => Color.blue,   // Blue for Ranged
                MinionType.Flying => Color.yellow, // Yellow for Flying
                MinionType.Boss => Color.magenta,  // Magenta for Boss
                _ => Color.white                   // White for default
            };
        }

        protected override void OnDestroy()
        {
            // Clean up all GameObjects
            foreach (var go in _entityGameObjects.Values)
            {
                if (go != null)
                {
                    Object.Destroy(go);
                }
            }

            if (_containerParent != null)
            {
                Object.Destroy(_containerParent);
            }

            _entityGameObjects?.Clear();
        }
    }
}