using Unity.Entities;
using UnityEngine;

namespace RareIcon
{
    public class ItemSpriteAtlasSingleton : IComponentData
    {
        public Texture2D Atlas;
        public bool      IsReady;
    }
}
