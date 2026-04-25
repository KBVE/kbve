using System.Collections.Generic;
using Newtonsoft.Json;

namespace RareIcon
{
    /// <summary>Deserialisation shape for <c>StreamingAssets/itemdb.json</c>. Mirrors the proto <c>Item</c> message (packages/data/proto/item/itemdb.proto) — field names match the raw mdx frontmatter (snake_case). Managed POCOs — not Burst-compatible. Consumed by <see cref="ItemDBLoaderSystem"/> at bootstrap into <see cref="ItemDBCache"/>; <see cref="ItemDB"/> materialises the blittable runtime slice from the cache.</summary>
    public sealed class ItemDBBundle
    {
        [JsonProperty("version")]      public int Version;
        [JsonProperty("generated_at")] public string GeneratedAt;
        [JsonProperty("count")]        public int Count;
        [JsonProperty("entries")]      public List<ItemDBDef> Entries = new();
    }

    /// <summary>One mdx entry — a single Item archetype. Only fields Rareicon consumes are declared; Newtonsoft ignores the rest.</summary>
    public sealed class ItemDBDef
    {
        [JsonProperty("id")]                public string Id;
        [JsonProperty("ref")]               public string Ref;
        [JsonProperty("key")]               public int Key;
        [JsonProperty("name")]              public string Name;
        [JsonProperty("description")]       public string Description;
        [JsonProperty("lore")]              public string Lore;

        [JsonProperty("type_flags")]        public int TypeFlags;
        [JsonProperty("rarity")]            public string Rarity;
        [JsonProperty("element")]           public string Element;
        [JsonProperty("tags")]              public List<string> Tags;
        [JsonProperty("emoji")]             public string Emoji;

        [JsonProperty("max_stack")]         public int? MaxStack;
        [JsonProperty("stackable")]         public bool? Stackable;
        [JsonProperty("weight")]            public float? Weight;
        [JsonProperty("volume")]            public float? Volume;

        [JsonProperty("level_requirement")] public int? LevelRequirement;
        [JsonProperty("quest_requirement")] public string QuestRequirement;

        [JsonProperty("buy_price")]         public int? BuyPrice;
        [JsonProperty("sell_price")]        public int? SellPrice;
        [JsonProperty("tradeable")]         public bool? Tradeable;

        [JsonProperty("consumable")]        public bool? Consumable;
        [JsonProperty("cooldown")]          public int? Cooldown;
        [JsonProperty("action")]            public string Action;

        [JsonProperty("pool_group")]        public string PoolGroup;

        [JsonProperty("food")]              public FoodInfoDef Food;
        [JsonProperty("skilling")]          public SkillingInfoDef Skilling;
        [JsonProperty("compress")]          public CompressInfoDef Compress;
        [JsonProperty("stacking")]          public StackingInfoDef Stacking;
        [JsonProperty("container")]         public ContainerInfoDef Container;
        [JsonProperty("weapon")]            public WeaponInfoDef Weapon;
        [JsonProperty("fuel")]              public FuelInfoDef Fuel;
        [JsonProperty("planting")]          public PlantingInfoDef Planting;
        [JsonProperty("projectile")]        public ProjectileInfoDef Projectile;
        [JsonProperty("trap")]              public TrapInfoDef Trap;
        [JsonProperty("enchantment")]       public EnchantmentInfoDef Enchantment;
        [JsonProperty("spell")]             public SpellInfoDef Spell;
        [JsonProperty("book")]              public BookInfoDef Book;
        [JsonProperty("unlock")]            public KeyInfoDef Unlock;
        [JsonProperty("vehicle")]           public VehicleInfoDef Vehicle;

        [JsonProperty("light_radius")]      public float? LightRadius;
        [JsonProperty("light_color")]       public string LightColor;
    }

    public sealed class FoodInfoDef
    {
        [JsonProperty("heals")]             public int? Heals;
        [JsonProperty("doses")]             public int? Doses;
        [JsonProperty("restore_energy")]    public int? RestoreEnergy;
        [JsonProperty("restore_mana")]      public int? RestoreMana;
        [JsonProperty("regen_per_second")]  public float? RegenPerSecond;
        [JsonProperty("regen_duration")]    public float? RegenDuration;
        [JsonProperty("duration")]          public int? Duration;
        [JsonProperty("perishable")]        public bool? Perishable;
        [JsonProperty("shelf_life_seconds")] public int? ShelfLifeSeconds;
        [JsonProperty("spoils_into_ref")]   public string SpoilsIntoRef;
    }

    public sealed class SkillingInfoDef
    {
        [JsonProperty("skill")]          public string Skill;   // "foraging" | "woodcutting" | "mining" | …
        [JsonProperty("skill_level")]    public int? SkillLevel;
        [JsonProperty("xp_reward")]      public float? XpReward;
        [JsonProperty("tool_required")]  public string ToolRequired;
        [JsonProperty("gather_time")]    public float? GatherTime;
        [JsonProperty("respawn_time")]   public int? RespawnTime;
        [JsonProperty("resource_node")]  public string ResourceNode;
        [JsonProperty("harvest_weight")] public int? HarvestWeight;
    }

    public sealed class CompressInfoDef
    {
        [JsonProperty("target_ref")] public string TargetRef;
        [JsonProperty("ratio")]      public int Ratio;
        [JsonProperty("facility")]   public string Facility;
    }

    public sealed class StackingInfoDef
    {
        [JsonProperty("pack_max")]   public int? PackMax;
        [JsonProperty("no_pack")]    public bool? NoPack;
        [JsonProperty("pool_group")] public string PoolGroup;
    }

    public sealed class ContainerInfoDef
    {
        [JsonProperty("added_slots")]      public int? AddedSlots;
        [JsonProperty("volume_multiplier")] public float? VolumeMultiplier;
        [JsonProperty("weight_reduction")]  public float? WeightReduction;
        [JsonProperty("storage_slots")]     public int? StorageSlots;
    }

    public sealed class WeaponInfoDef
    {
        [JsonProperty("range")]          public float? Range;
        [JsonProperty("attack_speed")]   public float? AttackSpeed;
        [JsonProperty("projectile_ref")] public string ProjectileRef;
        [JsonProperty("ammo_ref")]       public string AmmoRef;
        [JsonProperty("damage_element")] public string DamageElement;
        [JsonProperty("min_damage")]     public int? MinDamage;
        [JsonProperty("max_damage")]     public int? MaxDamage;
        [JsonProperty("two_handed")]     public bool? TwoHanded;
        [JsonProperty("aoe_radius")]     public int? AoeRadius;
    }

    public sealed class FuelInfoDef
    {
        [JsonProperty("burn_seconds")] public int BurnSeconds;
        [JsonProperty("heat_output")]  public int? HeatOutput;
        [JsonProperty("residue_ref")]  public string ResidueRef;
    }

    public sealed class PlantingInfoDef
    {
        [JsonProperty("grows_into_ref")] public string GrowsIntoRef;
        [JsonProperty("grow_seconds")]   public int GrowSeconds;
        [JsonProperty("yield_amount")]   public int? YieldAmount;
        [JsonProperty("required_tile")]  public string RequiredTile;
        [JsonProperty("multi_harvest")]  public bool? MultiHarvest;
    }

    public sealed class ProjectileInfoDef
    {
        [JsonProperty("speed")]         public float? Speed;
        [JsonProperty("gravity")]       public float? Gravity;
        [JsonProperty("pierce_count")]  public int? PierceCount;
        [JsonProperty("splash_radius")] public int? SplashRadius;
    }

    public sealed class TrapInfoDef
    {
        [JsonProperty("trigger")]           public string Trigger;
        [JsonProperty("arming_seconds")]    public int? ArmingSeconds;
        [JsonProperty("proximity_radius")]  public int? ProximityRadius;
        [JsonProperty("max_triggers")]      public int? MaxTriggers;
    }

    public sealed class EnchantmentInfoDef
    {
        [JsonProperty("slug")] public string Slug;
        [JsonProperty("tier")] public int? Tier;
    }

    public sealed class SpellInfoDef
    {
        [JsonProperty("spell_ref")]        public string SpellRef;
        [JsonProperty("mana_cost")]        public int? ManaCost;
        [JsonProperty("cooldown_seconds")] public float? CooldownSeconds;
        [JsonProperty("base_damage")]      public int? BaseDamage;
        [JsonProperty("range")]            public float? Range;
    }

    public sealed class BookInfoDef
    {
        [JsonProperty("body_text")]         public string BodyText;
        [JsonProperty("teaches_recipe_ref")] public string TeachesRecipeRef;
        [JsonProperty("teaches_spell_ref")]  public string TeachesSpellRef;
    }

    public sealed class KeyInfoDef
    {
        [JsonProperty("unlocks_ref")]      public string UnlocksRef;
        [JsonProperty("unlock_category")]  public string UnlockCategory;
        [JsonProperty("consumed_on_use")]  public bool? ConsumedOnUse;
    }

    public sealed class VehicleInfoDef
    {
        [JsonProperty("max_speed")]          public float? MaxSpeed;
        [JsonProperty("passenger_capacity")] public int? PassengerCapacity;
        [JsonProperty("fuel_ref")]           public string FuelRef;
        [JsonProperty("terrain_type")]       public string TerrainType;
    }
}
