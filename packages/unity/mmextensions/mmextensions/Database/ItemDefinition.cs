using UnityEngine;

namespace KBVE.MMExtensions.Database
{
    [CreateAssetMenu(menuName = "KBVE/Item Definition")]
    public class ItemDefinition : ScriptableObject
    {
        public string id;
        public int key;
        public string refId;
        public string name;
        public string type;
        public int category;
        public string description;
        public Sprite icon;
        public int pixelDensity;
        public float durability;
        public float weight;
        public bool equipped;
        public bool consumable;
        public string effects;
        public bool stackable;
        public string rarity;
        public int levelRequirement;
        public int price;
        public float cooldown;
        public string action;
        public string credits;
        public string slug;
    }
}
