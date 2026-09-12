using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;
using UnityEngine.UI;

namespace RareIcon
{
    public static class ItemSpriteAtlasOps
    {
        public static bool TryGetAtlas(EntityManager em, out Texture2D atlas)
        {
            atlas = null;
            using var q = em.CreateEntityQuery(typeof(ItemSpriteAtlasSingleton));
            if (q.CalculateEntityCount() == 0) return false;
            var s = em.GetComponentData<ItemSpriteAtlasSingleton>(q.GetSingletonEntity());
            if (s == null || !s.IsReady || s.Atlas == null) return false;
            atlas = s.Atlas;
            return true;
        }

        public static float4 GetUV(ushort itemId) => ItemSpriteAtlas.GetUV(itemId);

        /// <summary>Bind atlas + per-item UV onto a Material. Uses the standard `_MainTex_ST` (scale.x, scale.y, offset.x, offset.y) convention.</summary>
        public static void ApplyToMaterial(Material mat, Texture2D atlas, float4 uv)
        {
            if (mat == null) return;
            mat.mainTexture   = atlas;
            mat.mainTextureScale  = new Vector2(uv.z, uv.w);
            mat.mainTextureOffset = new Vector2(uv.x, uv.y);
        }

        /// <summary>Bind atlas + per-item UV onto a uGUI RawImage. Sets `texture` once + `uvRect` per slot.</summary>
        public static void ApplyToRawImage(RawImage img, Texture2D atlas, float4 uv)
        {
            if (img == null) return;
            img.texture = atlas;
            img.uvRect  = new Rect(uv.x, uv.y, uv.z, uv.w);
        }

        public static bool TryApplyToRawImage(EntityManager em, RawImage img, ushort itemId)
        {
            if (img == null) return false;
            if (!TryGetAtlas(em, out var atlas)) return false;
            ApplyToRawImage(img, atlas, GetUV(itemId));
            return true;
        }
    }
}
