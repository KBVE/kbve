using System.IO;
using Unity.Entities;
using UnityEngine;

namespace RareIcon
{
    [UpdateInGroup(typeof(InitializationSystemGroup), OrderFirst = true)]
    public partial class ItemSpriteAtlasLoaderSystem : SystemBase
    {
        Entity _entity;

        protected override void OnCreate() { Enabled = true; }

        protected override void OnUpdate()
        {
            Enabled = false;

            string path = Path.Combine(Application.streamingAssetsPath, "itemdb-atlas.png");
            if (!File.Exists(path))
            {
                Debug.LogError($"[ItemSpriteAtlasLoader] missing at {path}. Run `npx nx run astro-kbve:sync:itemdb-atlas` to regenerate.");
                return;
            }

            byte[] raw;
            try { raw = File.ReadAllBytes(path); }
            catch (IOException e)
            {
                Debug.LogError($"[ItemSpriteAtlasLoader] read failed: {e.Message}");
                return;
            }

            var tex = new Texture2D(ItemSpriteAtlas.AtlasSize, ItemSpriteAtlas.AtlasSize, TextureFormat.RGBA32, mipChain: false, linear: false)
            {
                name        = "ItemDB Sprite Atlas",
                wrapMode    = TextureWrapMode.Clamp,
                filterMode  = FilterMode.Point,
                anisoLevel  = 0,
            };
            if (!tex.LoadImage(raw, markNonReadable: false))
            {
                Debug.LogError("[ItemSpriteAtlasLoader] LoadImage rejected the PNG bytes.");
                Object.Destroy(tex);
                return;
            }
            tex.Apply(updateMipmaps: false, makeNoLongerReadable: true);

            _entity = EntityManager.CreateEntity();
            EntityManager.AddComponentData(_entity, new ItemSpriteAtlasSingleton
            {
                Atlas   = tex,
                IsReady = true,
            });
            EntityManager.SetName(_entity, "ItemSpriteAtlasSingleton");

            Debug.Log($"[ItemSpriteAtlasLoader] Loaded atlas {tex.width}x{tex.height}, {raw.Length} bytes.");
        }

        protected override void OnDestroy()
        {
            if (_entity == Entity.Null || !EntityManager.Exists(_entity)) return;
            var s = EntityManager.GetComponentData<ItemSpriteAtlasSingleton>(_entity);
            if (s != null && s.Atlas != null) Object.Destroy(s.Atlas);
        }
    }
}
