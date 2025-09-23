using Unity.Entities;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Defines the visibility radius for an entity, used in view frustum and distance culling.
    /// Represents the bounding sphere radius in world units (meters) for culling calculations.
    /// </summary>
    /// <remarks>
    /// This component works in conjunction with the Visible component to optimize rendering:
    /// - The radius defines how far from the entity center it should still be considered visible
    /// - Used by culling systems to determine if entity intersects with camera frustum
    /// - Enables per-entity LOD (Level of Detail) decisions based on distance
    ///
    /// Radius guidelines:
    /// - Small entities (projectiles, items): 0.5 - 2.0
    /// - Normal entities (zombies, minions): 2.0 - 5.0
    /// - Large entities (bosses, buildings): 5.0 - 20.0
    /// - Massive entities (terrain features): 20.0+
    ///
    /// Culling behavior:
    /// - Entity is visible if: distance_to_camera - ViewRadius < max_view_distance
    /// - Entity enters frustum if: bounding_sphere(position, ViewRadius) intersects frustum
    ///
    /// Performance considerations:
    /// - Larger radius = entity stays visible longer (more rendering cost)
    /// - Smaller radius = aggressive culling (risk of pop-in)
    /// - Set radius slightly larger than visual bounds to prevent edge flickering
    ///
    /// Example usage:
    /// <code>
    /// // For a zombie entity
    /// EntityManager.AddComponentData(entity, new ViewRadius { Value = 3.0f });
    ///
    /// // For a boss entity with large visual effects
    /// EntityManager.AddComponentData(entity, new ViewRadius { Value = 15.0f });
    ///
    /// // In a culling system
    /// float distanceToCamera = math.distance(cameraPos, entityPos);
    /// bool shouldCull = distanceToCamera - viewRadius.Value > maxViewDistance;
    /// EntityManager.SetComponentEnabled<Visible>(entity, !shouldCull);
    /// </code>
    ///
    /// Future integration:
    /// - Will be used by upcoming ViewCullingSystem for automatic frustum culling
    /// - Can be dynamically adjusted based on entity importance or LOD level
    /// - May be combined with ViewImportance for priority-based culling
    /// </remarks>
    public struct ViewRadius : IComponentData
    {
        /// <summary>
        /// The culling radius in world units (meters).
        /// Represents the bounding sphere radius from entity center.
        /// </summary>
        public float Value;

        /// <summary>
        /// Creates a ViewRadius with the specified radius value.
        /// </summary>
        /// <param name="radius">The culling radius in world units</param>
        public ViewRadius(float radius)
        {
            Value = radius;
        }

        // Common preset values for different entity types
        public static readonly ViewRadius Small = new ViewRadius(1.0f);
        public static readonly ViewRadius Medium = new ViewRadius(3.0f);
        public static readonly ViewRadius Large = new ViewRadius(8.0f);
        public static readonly ViewRadius Huge = new ViewRadius(15.0f);
        public static readonly ViewRadius Massive = new ViewRadius(30.0f);
    }
}