using System.Collections.Generic;
using Newtonsoft.Json;

namespace RareIcon
{
    /// <summary>Deserialisation shape for <c>StreamingAssets/mapdb.json</c>. Mirrors the proto <c>WorldObjectDef</c> + capability specs (packages/data/proto/map/mapdb.proto). Managed POCOs — not Burst-compatible. Consumed by <see cref="MapdbLoaderSystem"/> at bootstrap into <see cref="MapdbCache"/>; runtime registries (e.g. BuildingPrefabRegistrySystem) read the cache to bake Entity prefabs.</summary>
    public sealed class MapdbBundle
    {
        [JsonProperty("version")]      public int Version;
        [JsonProperty("generated_at")] public string GeneratedAt;
        [JsonProperty("count")]        public int Count;
        [JsonProperty("entries")]      public List<MapdbDef> Entries = new();
    }

    /// <summary>One mdx entry — a <c>WorldObjectDef</c> archetype. Only fields Rareicon consumes are declared; Newtonsoft ignores the rest.</summary>
    public sealed class MapdbDef
    {
        [JsonProperty("id")]          public string Id;
        [JsonProperty("ref")]         public string Ref;
        [JsonProperty("name")]        public string Name;
        [JsonProperty("description")] public string Description;
        [JsonProperty("type")]        public string Type;         // WorldObjectType enum slug ("building", "resource_node", …)
        [JsonProperty("sub_kind")]    public string SubKind;
        [JsonProperty("img")]         public string Img;

        [JsonProperty("interactable")]     public bool? Interactable;
        [JsonProperty("destructible")]     public bool? Destructible;
        [JsonProperty("blocks_movement")]  public bool? BlocksMovement;
        [JsonProperty("blocks_placement")] public bool? BlocksPlacement;

        [JsonProperty("max_health")]             public int? MaxHealth;
        [JsonProperty("footprint_width")]        public int? FootprintWidth;
        [JsonProperty("footprint_height")]       public int? FootprintHeight;
        [JsonProperty("footprint_shape")]        public string FootprintShape;
        [JsonProperty("construction_time_secs")] public float? ConstructionTimeSecs;
        [JsonProperty("spawns_fully_built")]     public bool? SpawnsFullyBuilt;
        [JsonProperty("requires_in_territory")]  public bool? RequiresInTerritory;
        [JsonProperty("cost_source")]            public string CostSource;

        [JsonProperty("harvest_yield")]   public int? HarvestYield;
        [JsonProperty("max_amount")]      public int? MaxAmount;
        [JsonProperty("initial_amount")]  public int? InitialAmount;
        [JsonProperty("harvest_time_ms")] public int? HarvestTimeMs;
        [JsonProperty("tool_required")]   public string ToolRequired;
        [JsonProperty("skill_type")]      public string SkillType;
        [JsonProperty("skill_level")]     public int? SkillLevel;

        [JsonProperty("spawn_weight")] public float? SpawnWeight;
        [JsonProperty("spawn_count")]  public int? SpawnCount;

        [JsonProperty("allowed_biomes")] public List<int> AllowedBiomes;

        [JsonProperty("build_costs")] public List<BuildCost> BuildCosts;
        [JsonProperty("services")]    public List<ServiceCapability> Services;
        [JsonProperty("tender")]      public TenderSpec Tender;
        [JsonProperty("territory")]   public TerritoryEmitterSpec Territory;
        [JsonProperty("recipes")]     public List<ProductionRecipeSpec> Recipes;
        [JsonProperty("surplus")]     public List<SurplusExportSpec> Surplus;

        [JsonProperty("passive_production")] public PassiveProductionSpec PassiveProduction;
        [JsonProperty("ranged_attack")]      public RangedAttackSpec RangedAttack;
        [JsonProperty("population_spawn")]   public PopulationSpawnSpec PopulationSpawn;
        [JsonProperty("raid")]               public RaidSpec Raid;
        [JsonProperty("upgrade_chain")]      public UpgradeChainSpec UpgradeChain;

        public sealed class BuildCost
        {
            [JsonProperty("resource_type")] public string ResourceType;
            [JsonProperty("amount")]        public int Amount;
        }

        public sealed class ServiceCapability
        {
            [JsonProperty("kind")]     public string Kind;      // food / sleep / healing / training / teleport / storage / merchant / banker
            [JsonProperty("priority")] public int Priority;
            [JsonProperty("capacity")] public int Capacity;
        }

        public sealed class TenderSpec
        {
            [JsonProperty("profession_ref")]   public string ProfessionRef;
            [JsonProperty("footprint_radius")] public int FootprintRadius;
            [JsonProperty("required")]         public bool Required;
        }

        public sealed class TerritoryEmitterSpec
        {
            [JsonProperty("radius")] public int Radius;
        }

        public sealed class IngredientSpec
        {
            [JsonProperty("item_ref")] public string ItemRef;
            [JsonProperty("amount")]   public int Amount;
        }

        public sealed class ProductionRecipeSpec
        {
            [JsonProperty("inputs")]              public List<IngredientSpec> Inputs;
            [JsonProperty("outputs")]             public List<IngredientSpec> Outputs;
            [JsonProperty("cycle_secs")]          public float CycleSecs;
            [JsonProperty("pulls_from_treasury")] public bool PullsFromTreasury;
        }

        public sealed class SurplusExportSpec
        {
            [JsonProperty("item_ref")] public string ItemRef;
            [JsonProperty("floor")]    public int Floor;
        }

        public sealed class PassiveProductionSpec
        {
            [JsonProperty("output_item_ref")] public string OutputItemRef;
            [JsonProperty("output_amount")]   public int OutputAmount;
            [JsonProperty("cycle_secs")]      public float CycleSecs;
            [JsonProperty("destination")]     public string Destination;
        }

        public sealed class RangedAttackSpec
        {
            [JsonProperty("cooldown_secs")]         public float CooldownSecs;
            [JsonProperty("range")]                 public float Range;
            [JsonProperty("shots_per_volley")]      public int ShotsPerVolley;
            [JsonProperty("ammo_per_volley_cost")]  public int AmmoPerVolleyCost;
            [JsonProperty("damage_per_shot")]       public float DamagePerShot;
            [JsonProperty("spread_half_angle_rad")] public float SpreadHalfAngleRad;
            [JsonProperty("projectile_speed")]      public float ProjectileSpeed;
            [JsonProperty("projectile_lifetime")]   public float ProjectileLifetime;
            [JsonProperty("projectile_ref")]        public string ProjectileRef;
            [JsonProperty("ammo_capacity")]         public int AmmoCapacity;
        }

        public sealed class PopulationSpawnSpec
        {
            [JsonProperty("spawn_entity_ref")] public string SpawnEntityRef;
            [JsonProperty("cadence_turns")]    public int CadenceTurns;
            [JsonProperty("cost_per_spawn")]   public IngredientSpec CostPerSpawn;
            [JsonProperty("storage_cap")]      public int StorageCap;
        }

        public sealed class RaidSpec
        {
            [JsonProperty("cadence_turns")] public int CadenceTurns;
            [JsonProperty("party_size")]    public int PartySize;
            [JsonProperty("party_unit_ref")] public string PartyUnitRef;
            [JsonProperty("target_kind")]   public string TargetKind;
        }

        public sealed class UpgradeSpec
        {
            [JsonProperty("next_def_ref")] public string NextDefRef;
            [JsonProperty("costs")]        public List<IngredientSpec> Costs;
        }

        public sealed class UpgradeChainSpec
        {
            [JsonProperty("tiers")] public List<UpgradeSpec> Tiers;
        }
    }
}
