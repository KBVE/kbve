using UnityEngine;

namespace KBVE.MMExtensions.Database
{
    public class ItemData : MonoBehaviour
    {
        public string id;
        public string itemName;
        public string description;
        public string type;
        public int category;
        public float weight;
        public int price;
        public bool stackable;
        public bool consumable;
        public string rarity;
        public float cooldown;
        public string effects;

        // Optional: store raw reference ID / slug for in-game linking
        public string refId;
        public string slug;

        public void Apply(EditorItemDB.ItemEntry item)
        {
            id = item.id;
            itemName = item.name;
            description = item.description;
            type = item.type;
            category = item.category;
            weight = item.weight;
            price = item.price;
            stackable = item.stackable;
            consumable = item.consumable;
            rarity = item.rarity;
            cooldown = item.cooldown;
            effects = item.effects;
            refId = item.@ref;
            slug = item.slug;
        }
    }
}
