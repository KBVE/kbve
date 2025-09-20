using UnityEngine;
using NSprites;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Configuration
{
    /// <summary>
    /// ScriptableObject to hold sprite render data for different minion types
    /// This will be used with NSprites to register rendering archetypes
    /// </summary>
    [CreateAssetMenu(fileName = "MinionSpriteRenderData", menuName = "KBVE/DOTS/Minion Sprite Render Data")]
    public class MinionSpriteRenderData : ScriptableObject
    {
        [Header("Minion Sprite Settings")]
        [Tooltip("Array of sprites for each minion type (Basic=0, Tank=1, Fast=2, Ranged=3, Flying=4, Boss=5)")]
        public Sprite[] minionSprites = new Sprite[6];

        [Tooltip("Material to use for sprite rendering")]
        public Material spriteMaterial;

        [Tooltip("Default scale for all minion sprites")]
        public float defaultScale = 1f;

        /// <summary>
        /// Get sprite for a specific minion type
        /// </summary>
        public Sprite GetSpriteForType(MinionType type)
        {
            int index = (int)type;
            if (index >= 0 && index < minionSprites.Length && minionSprites[index] != null)
            {
                return minionSprites[index];
            }

            // Fallback to first sprite if available
            return minionSprites.Length > 0 ? minionSprites[0] : null;
        }

        /// <summary>
        /// Check if all required data is set up
        /// </summary>
        public bool IsValid()
        {
            if (spriteMaterial == null)
            {
                Debug.LogError($"[MinionSpriteRenderData] {name}: No sprite material assigned!");
                return false;
            }

            bool hasAnySprite = false;
            for (int i = 0; i < minionSprites.Length; i++)
            {
                if (minionSprites[i] != null)
                {
                    hasAnySprite = true;
                    break;
                }
            }

            if (!hasAnySprite)
            {
                Debug.LogError($"[MinionSpriteRenderData] {name}: No sprites assigned!");
                return false;
            }

            return true;
        }
    }
}