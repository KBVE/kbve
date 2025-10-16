using System;
using System.Collections.Generic;
using Puerts;
using UnityEngine.UIElements;
using OneJS;
using OneJS.Attributes;
using OneJS.Dom;
using R3;
using ObservableCollections;
using Unity.Collections;
using Unity.Mathematics;
using KBVE.MMExtensions.Orchestrator.DOTS;

#if UNITY_EDITOR
namespace KBVE.MMExtensions.Editor
{
    /// <summary>
    /// PuerTS configuration for DOTS entity system optimization.
    /// Defines blittable types for zero-GC interop between C# and OneJS/TypeScript.
    /// This enables high-performance entity data transfer to UI components.
    /// </summary>
    [Configure]
    public class BlittableDOTSCfg
    {
        [CodeOutputDirectory]
        static string OutputDir => UnityEngine.Application.dataPath + "/_gen/";

        // Declare here any struct you'll be using during DOTS entity interop.
        // PuerTS will optimize the memory usage, eliminating GC in most cases.
        [BlittableCopy]
        static IEnumerable<Type> DOTSBlittables
        {
            get
            {
                return new List<Type>()
                {
                    // ============================================
                    // CORE ENTITY SYSTEM TYPES
                    // ============================================

                    // Universal Entity Data
                    typeof(EntityData),
                    typeof(EntityBlitContainer),

                    // Entity Type and Action Enums
                    typeof(EntityType),
                    typeof(EntityActionFlags),

                    // ============================================
                    // TYPE-SPECIFIC DATA STRUCTURES
                    // ============================================

                    // Resource System
                    typeof(ResourceData),
                    typeof(ResourceType),
                    typeof(ResourceFlags),

                    // Structure System
                    typeof(StructureData),
                    typeof(StructureType),
                    typeof(StructureFlags),

                    // Item System
                    typeof(ItemData),
                    typeof(ItemType),
                    typeof(ItemRarity),
                    typeof(ItemFlags),

                    // Player System
                    typeof(PlayerData),
                    typeof(PlayerClass),
                    typeof(PlayerFlags),

                    // Combatant System
                    typeof(CombatantData),
                    typeof(CombatantType),
                    typeof(CombatantFlags),

                    // ============================================
                    // UNITY DOTS/MATHEMATICS TYPES
                    // ============================================

                    // Unity Mathematics (for world positions, etc.)
                    typeof(float3),
                    typeof(float2),
                    typeof(int3),
                    typeof(int2),

                    // Unity Collections (for ULIDs, etc.)
                    typeof(FixedBytes16),
                    // Note: Only FixedBytes16, FixedBytes30, FixedBytes62, FixedBytes126, FixedBytes510, FixedBytes4094 exist
                    // We primarily use FixedBytes16 for ULIDs

                    // ============================================
                    // ECS COMPONENT WRAPPERS
                    // ============================================

                    // Component wrappers for ECS integration
                    typeof(EntityComponent),
                    typeof(EntityTypeComponent),
                    typeof(Orchestrator.DOTS.Resource),
                    typeof(Structure),
                    typeof(Item),
                    typeof(Player),
                    typeof(Combatant),

                    // ============================================
                    // ADDITIONAL UNITY TYPES FOR UI
                    // ============================================

                    // Extended Unity types for UI interactions
                    typeof(UnityEngine.Bounds),
                    typeof(UnityEngine.BoundsInt),
                    typeof(UnityEngine.Matrix4x4),
                    typeof(UnityEngine.Vector4),
                    typeof(UnityEngine.Vector2Int),
                    typeof(UnityEngine.Vector3Int),
                };
            }
        }

        // Optional: Add additional bindings specific to DOTS if needed
        [Binding]
        static IEnumerable<Type> DOTSBindings
        {
            get
            {
                return new List<Type>()
                {
                    // Add any additional types that need binding generation
                    // but don't require blittable optimization
                    typeof(EntityExtensions),
                    typeof(EntityBlitHelpers),
                };
            }
        }
    }
}

#endif
