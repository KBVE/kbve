using System.Collections.Generic;
using UnityEngine;

namespace RareIcon
{
    /// <summary>Procedural icon atlas — bakes each IconType into a Texture2D via Graphics.Blit against RareIcon/HexIcon at startup. UI consumers fetch with GetIcon and set it as VisualElement.style.backgroundImage. One bake per icon, cached for the session.</summary>
    public static class IconFactory
    {
        /// <summary>Icon IDs — must match the ICON_* defines in HexIcon.shader.</summary>
        public enum IconType : byte
        {
            None   = 0,
            Build  = 1,
            Crown  = 2,
            Coin   = 3,
            Shield = 4,
            Gear   = 5,
            Search = 6,
            People = 7,
        }

        const int BakeSize = 48;

        static readonly Dictionary<IconType, Texture2D> _cache = new();
        static Material _material;

        /// <summary>Returns the cached texture for the given icon, baking it on first request.</summary>
        public static Texture2D GetIcon(IconType type)
        {
            if (type == IconType.None) return null;
            if (_cache.TryGetValue(type, out var cached) && cached != null) return cached;

            if (_material == null)
            {
                var shader = Shader.Find("RareIcon/HexIcon");
                if (shader == null)
                {
                    Debug.LogError("[IconFactory] HexIcon shader not found");
                    return null;
                }
                _material = new Material(shader);
                _material.SetFloat("_PixelGrid", 24f);
            }

            var tex = Bake(type);
            _cache[type] = tex;
            return tex;
        }

        static Texture2D Bake(IconType type)
        {
            _material.SetFloat("_IconType", (float)(byte)type);

            var rt = RenderTexture.GetTemporary(BakeSize, BakeSize, 0, RenderTextureFormat.ARGB32);
            rt.filterMode = FilterMode.Point;

            var prevActive = RenderTexture.active;
            Graphics.Blit(null, rt, _material);
            RenderTexture.active = rt;

            var tex = new Texture2D(BakeSize, BakeSize, TextureFormat.RGBA32, false);
            tex.filterMode = FilterMode.Point;
            tex.wrapMode   = TextureWrapMode.Clamp;
            tex.ReadPixels(new Rect(0, 0, BakeSize, BakeSize), 0, 0);
            tex.Apply();

            RenderTexture.active = prevActive;
            RenderTexture.ReleaseTemporary(rt);
            return tex;
        }
    }
}
