using UnityEngine;
using NSprites;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Configuration
{
    /// <summary>
    /// Helper component to configure NSprites Foundation rendering for minions
    /// This helps set up the required Foundation modules
    /// </summary>
    [CreateAssetMenu(fileName = "MinionSpriteConfiguration", menuName = "KBVE/DOTS/Minion Sprite Configuration")]
    public class MinionSpriteConfiguration : ScriptableObject
    {
        [Header("Materials")]
        [Tooltip("Material to use for minion sprite rendering")]
        public Material minionMaterial;

        [Header("Properties Set")]
        [Tooltip("PropertiesSet asset that defines shader properties for NSprites")]
        public PropertiesSet propertiesSet;

        [Header("Default Sprite Settings")]
        [Tooltip("Default size for minion sprites")]
        public Vector2 defaultSize = Vector2.one;

        [Tooltip("Default pivot point (0.5, 0.5 = center)")]
        public Vector2 defaultPivot = new Vector2(0.5f, 0.5f);

        /// <summary>
        /// Get a properly configured SpriteRenderData for this configuration
        /// </summary>
        public SpriteRenderData GetSpriteRenderData()
        {
            if (minionMaterial == null)
            {
                Debug.LogError($"[MinionSpriteConfiguration] No material assigned to {name}");
                return default;
            }

            if (propertiesSet == null)
            {
                Debug.LogError($"[MinionSpriteConfiguration] No PropertiesSet assigned to {name}");
                return default;
            }

            return new SpriteRenderData
            {
                Material = minionMaterial,
                PropertiesSet = propertiesSet
            };
        }

        /// <summary>
        /// Validate that this configuration is properly set up
        /// </summary>
        public bool IsValid(out string errorMessage)
        {
            if (minionMaterial == null)
            {
                errorMessage = "Material is not assigned";
                return false;
            }

            if (propertiesSet == null)
            {
                errorMessage = "PropertiesSet is not assigned";
                return false;
            }

            errorMessage = "";
            return true;
        }
    }
}