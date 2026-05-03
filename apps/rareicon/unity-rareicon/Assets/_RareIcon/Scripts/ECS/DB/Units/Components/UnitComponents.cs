using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;

namespace RareIcon
{
    /// <summary>
    /// Unit type IDs — passed to HexUnit.shader via _UnitType to pick which
    /// pixel-art include draws the creature. Add new ones at the end.
    /// </summary>
    public static class UnitType
    {
        public const byte None    = 0;
        public const byte Goblin  = 1;
        public const byte Knight  = 2;
        public const byte Soldier = 3;
        public const byte Mage    = 4;
        public const byte King    = 5;  // Player-controlled — visually a Soldier + Crown for v1.
        public const byte Archer   = 6;  // Humanoid ranger — hooded, forest leather, back quiver.
        public const byte Rogue    = 7;  // Humanoid dual-dagger — dark cloak + face scarf.
        public const byte Cleric   = 8;  // Humanoid healer — pale robe, gold trim, holy symbol.
        public const byte Merchant = 9;  // Humanoid civilian trader — flat cap, coin pouch.
        public const byte Chicken = 10;
        public const byte Sheep   = 11;
        public const byte Cow     = 12;
        public const byte Wolf    = 13;  // Beast faction, forest pack hunter.
        public const byte Bandit  = 14;  // Hostile faction, raid waves alongside goblins.
        public const byte Zombie  = 15;
        public const byte GoblinGeneral = 16; // Warlord goblin — chestplate, spiked crown, warpaint.
        public const byte FishingBoat   = 17; // Water-locked craftsman-built vessel; hunts Whales for Oil + Meat.
        public const byte Whale         = 18; // Oceanic / river leviathan — FishingBoats' prey.
        public const byte Galley        = 19; // Water-locked Player-faction warship — Shipyard-built, ranged arrow attack.
        public const byte PirateShip    = 20; // Water-locked Hostile-faction raider — PirateCove-spawned, ranged arrow attack.
        public const byte Scout         = 21; // Player-faction recon — fast, low HP, big vision radius for fog reveal. Recruited from Barracks.
        public const byte BanditScout   = 22; // Hostile-faction recon — wanders far from BanditCamp, marks discovered Player buildings as raid targets.
        public const byte Cavalry       = 23; // Player-faction mounted melee — fast charger, decent HP, recruited from Stables (Barracks T1 variant 1).
        // Skeleton, etc. land here as we add them.
    }

    /// <summary>Per-unit display name as two pool indexes — 4 bytes total. FirstNameId picks from a language-neutral pool (goblin names like "Skab" read the same in any locale); EpithetId picks from a localizable pool ("the Sly" / "ずる賢き"). 0 in either slot = unset; the UI falls back to the creature.* locale label when both are 0.</summary>
    // TODO(rust-ffi): persist {FirstNameId, EpithetId} in the per-chunk store so a goblin keeps its name across chunk unload.
    public struct UnitName : IComponentData
    {
        public ushort FirstNameId;
        public ushort EpithetId;
    }

    /// <summary>Tag marking wild animals so combat / harvest / AI systems skip them.</summary>
    public struct PassiveAnimalTag : IComponentData { }

    /// <summary>Marker tag for craftsman-built Fishing Boats — water-locked; hunts <see cref="WhaleTag"/> units for Oil + Meat.</summary>
    public struct FishingBoatTag : IComponentData { }

    /// <summary>Marker tag for Whales — FishingBoats' prey. Drops Oil + 400 Meat via EnemyLootDropSystem on death.</summary>
    public struct WhaleTag : IComponentData { }

    /// <summary>Marker tag for Player-faction Galley warships — Shipyard-built, water-locked, carries a <see cref="RangedAttack"/> arrow loadout. Distinguishes Galleys from FishingBoats so combat AI / repair systems can branch.</summary>
    public struct GalleyTag : IComponentData { }

    /// <summary>Marker tag for Hostile-faction PirateShip raiders — PirateCove-spawned, water-locked, carries a <see cref="RangedAttack"/> arrow loadout. Treated as a threat by ProfessionDispatch + threat scan.</summary>
    public struct PirateShipTag : IComponentData { }

    /// <summary>Marker tag for Player-faction Scouts — Barracks-recruited recon unit. Excluded from Hunt / harvesting so they purely run reveal patrols, contributing a long-radius vision source to <see cref="FogBakeSystem"/>.</summary>
    public struct ScoutTag : IComponentData { }

    /// <summary>Marker tag for Hostile-faction BanditScouts — periodically dispatched by BanditCamps to wander far from camp + mark discovered Player buildings into the shared known-target set so HuntJob can divert raid waves to outposts beyond the camp's local TargetingRadius.</summary>
    public struct BanditScoutTag : IComponentData { }

    /// <summary>Marker tag for Player-faction Cavalry — fast melee charger recruited from Stables. Carries the standard Player MeleeAttack loadout but with mount-driven move speed; future SpeedCharge pass can hook combat damage to MovementModifier.SpeedMul for charge bonus.</summary>
    public struct CavalryTag : IComponentData { }

    /// <summary>Per-unit fog-of-war vision radius override. Attached to recon units (Scout = 3, future GriffinFlyer = 5+) so <see cref="FogBakeSystem"/> can give them a wider reveal than the default 1-hex unit baseline. Combat units leave this off and inherit the default — keeps the gather-loop in the bake job branchless except for the lookup probe.</summary>
    public struct VisionRadius : IComponentData
    {
        public float Value;
    }

    /// <summary>Unit only accepts river/ocean destinations when wandering. WaterWanderJob validates the rolled target's BiomeType against this tag before committing the goal. Attach to Fishing Boats + Whales.</summary>
    public struct WaterLockedTag : IComponentData { }

    /// <summary>Tag added once an animal has been tamed by a player entity.</summary>
    public struct TamedTag : IComponentData { }

    /// <summary>Reference to the entity that tamed / owns this unit (used for follow / recall).</summary>
    public struct OwnerRef : IComponentData { public Entity Value; }

    /// <summary>
    /// Tag for the player's King — identity marker, exactly one in the
    /// world. Used as a cost source (King's pocket carries the
    /// CapitalLandGrant) and as the default focus target for the
    /// "King" toolbar button. Distinct from <see cref="ControlledUnitTag"/>
    /// — the King is always the King, but may or may not be the unit
    /// the player is actively driving.
    /// </summary>
    public struct KingTag : IComponentData { }

    /// <summary>
    /// "Player is currently driving this entity." At most one entity in
    /// the world carries this at a time. Possessable by any unit (King
    /// by default at game start; click-to-possess swaps it to a goblin
    /// or any future selectable creature).
    ///
    /// Behavior systems that should treat the player avatar as
    /// manually-driven (no auto-wander, no auto-job) gate on this tag
    /// rather than KingTag — that way a possessed goblin gets the same
    /// "manual control, suppress AI" treatment as the King would.
    /// </summary>
    public struct ControlledUnitTag : IComponentData { }

    /// <summary>Unit is posted to a specific hex (typically a Capital footprint tile) — excluded from wander, zero ProfessionPriorities on spawn, RangedAttack still auto-fires at enemies in range. Hex stored for future "return to post" behaviour if they're ever knocked off-tile.</summary>
    public struct GarrisonPost : IComponentData
    {
        public int2 Hex;
    }

    /// <summary>Per-bandit home reference. <c>BanditChoreSystem</c> walks bandits between their camp's <see cref="CampHex"/> and resource-bearing hexes nearby; arriving at a resource hex deplets <see cref="HexResources"/> + increments the camp's <see cref="BanditCampStockpile"/>. <see cref="Camp"/> may resolve to <c>Entity.Null</c> after the camp is destroyed; the chore system gates on stockpile presence.</summary>
    public struct BanditHome : IComponentData
    {
        public Entity Camp;
        public int2   CampHex;
    }

    /// <summary>Per-bandit chore state. Phase 0 = idle (waiting on cooldown), 1 = walking out to <see cref="TargetHex"/>, 2 = walking back to camp. Hunt (40) hijacks the chore goal mid-march so combat always takes priority. Resets to phase 0 when bandit returns to camp hex.</summary>
    public struct BanditChore : IComponentData
    {
        public byte Phase;
        public int2 TargetHex;
        public uint NextActTick;
    }

    /// <summary>Unit is resident inside Host building — hidden via DisableRendering, excluded from movement / collision / command queries until released. State (HP, inventory, stats) stays intact on the entity.</summary>
    public struct ShelteredInside : IComponentData
    {
        public Entity Host;
    }

    /// <summary>Transient ECS request — published by UI ("Send Out" button on the Capital inspector) and consumed by ShelterSystem, which releases every ShelteredInside unit pointing at Host and destroys this entity.</summary>
    public struct ReleaseShelterRequest : IComponentData
    {
        public Entity Host;
    }

    /// <summary>Records the unit's WanderStep at the moment it was released from shelter — ShelterSystem refuses to re-shelter until the step advances (i.e., the unit has actually walked somewhere), so "Send Out" isn't cancelled by the next frame's auto-shelter pass.</summary>
    public struct ShelterCooldown : IComponentData
    {
        public uint WanderStepAtRelease;
    }

    /// <summary>Per-unit identity + currently-equipped loadout. Source of truth for the shader — EquipmentVisualMirrorSystem pushes these slots to UnitXVisual each tick. Ghost-replicated so clients see server-authoritative unit type + equipment swaps without a separate RPC.</summary>
    [Unity.NetCode.GhostComponent]
    public struct Unit : IComponentData
    {
        [Unity.NetCode.GhostField] public byte Type;
        [Unity.NetCode.GhostField] public byte Weapon;
        [Unity.NetCode.GhostField] public byte Helmet;
        [Unity.NetCode.GhostField] public byte Shield;
        [Unity.NetCode.GhostField] public byte Armor;
    }

    /// <summary>Weapon IDs — each maps to one HexX.hlsl draw function.</summary>
    public static class WeaponType
    {
        public const byte None     = 0;
        public const byte Club     = 1;
        public const byte Crossbow = 2;
        public const byte Sword    = 3;
        public const byte Wand     = 4;
        public const byte Bow      = 5;
    }

    /// <summary>
    /// Helmet IDs — per-instance equipment slot layered over the unit's
    /// head in HexUnit.shader. 0 = no helmet drawn. Knights already ship
    /// an integral helm in their sprite, so the shader skips the helmet
    /// slot on knights regardless of this value.
    /// </summary>
    public static class HelmetType
    {
        public const byte None     = 0;
        public const byte Cap      = 1;
        public const byte Hood     = 2;
        public const byte Bascinet = 3;
    }

    /// <summary>Body-armor IDs — per-instance equipment slot tinted over the body in HexUnit.shader. 0 = no armor (body sprite renders bare). Visual differentiation for non-zero values uses a tint pass; per-armor sprite shapes can land later.</summary>
    public static class ArmorType
    {
        public const byte None      = 0;
        public const byte Leather   = 1;
        public const byte ChainMail = 2;
        public const byte Iron      = 3;
        public const byte Crystal   = 4;
        public const byte Plate     = 5;
    }

    /// <summary>
    /// Shield IDs — per-instance equipment slot rendered on the unit's
    /// off-hand side in HexUnit.shader. 0 = no shield drawn.
    /// </summary>
    public static class ShieldType
    {
        public const byte None       = 0;
        public const byte Buckler    = 1;
        public const byte Wooden     = 2;
        public const byte Iron       = 3;
        public const byte Kite       = 4;
        public const byte GoldPlated = 5;

        public const byte Round = Iron;
    }

    /// <summary>
    /// Per-instance MaterialProperty so the shader knows which weapon to
    /// draw on top of the creature sprite (positioned at the creature's
    /// hand anchor). 0 = no weapon, otherwise WeaponType.* constant.
    /// </summary>
    [MaterialProperty("_UnitWeapon")]
    public struct UnitWeaponVisual : IComponentData
    {
        public float Value;
    }

    /// <summary>
    /// Per-instance MaterialProperty for the head equipment slot.
    /// 0 = no helmet drawn, otherwise HelmetType.* constant.
    /// </summary>
    [MaterialProperty("_UnitHelmet")]
    public struct UnitHelmetVisual : IComponentData
    {
        public float Value;
    }

    /// <summary>
    /// Per-instance MaterialProperty for the off-hand equipment slot.
    /// 0 = no shield drawn, otherwise ShieldType.* constant.
    /// </summary>
    [MaterialProperty("_UnitShield")]
    public struct UnitShieldVisual : IComponentData
    {
        public float Value;
    }

    /// <summary>Per-instance MaterialProperty for body armor. 0 = bare body, otherwise <see cref="ArmorType"/>.* constant. Reserved for the upcoming HexUnit.shader armor-tint pass; system pipeline writes the value already so visuals follow once the shader pass lands.</summary>
    [MaterialProperty("_UnitArmor")]
    public struct UnitArmorVisual : IComponentData
    {
        public float Value;
    }

    /// <summary>
    /// Per-instance MaterialProperty: 1 when the unit is actively moving
    /// toward a target, 0 when at rest. The shader's _UnitStep / _UnitBob
    /// helpers multiply by this so a stationary unit doesn't march in place.
    /// Without this gate, the bob also detaches stationary helmets from
    /// the head — the King's crown looks cut off because the body bobs but
    /// the helmet anchor stays at the unbobbed position.
    /// </summary>
    [MaterialProperty("_UnitMoving")]
    public struct UnitMovingVisual : IComponentData
    {
        public float Value;
    }

    /// <summary>Per-instance MaterialProperty mirroring <see cref="SelectedTag"/> into HexUnit.shader. The shader paints a gold ring at the unit's feet when Value > 0.5; SelectionVisualSystem writes 1 on units carrying SelectedTag and 0 otherwise every frame.</summary>
    [MaterialProperty("_UnitSelected")]
    public struct UnitSelectedVisual : IComponentData
    {
        public float Value;
    }

    /// <summary>Tag for the spawn-system test goblin (cleanup later).</summary>
    public struct UnitTestTag : IComponentData { }

    /// <summary>
    /// Per-instance MaterialProperty so HexUnit.shader knows which creature
    /// to draw on each unit entity. Value is the UnitType byte cast to float.
    /// </summary>
    [MaterialProperty("_UnitType")]
    public struct UnitVisual : IComponentData
    {
        public float Value;
    }

    /// <summary>
    /// 4-direction sprite facing for top-down units. The unit shader picks a
    /// distinct sprite for each facing (West reuses East mirrored).
    /// </summary>
    public static class UnitFacing
    {
        public const byte East  = 0;  // looking right (default)
        public const byte North = 1;  // looking up — back of character
        public const byte West  = 2;  // looking left (mirrored East sprite)
        public const byte South = 3;  // looking down — toward camera
    }

    /// <summary>
    /// Per-instance MaterialProperty carrying the unit's facing direction.
    /// Updated by UnitMovementSystem from the most-recent movement vector.
    /// </summary>
    [MaterialProperty("_UnitFacing")]
    public struct UnitFacingVisual : IComponentData
    {
        public float Value;
    }

    /// <summary>
    /// Per-unit movement state for wandering. Sim stays in hex-space; world
    /// position is derived only when interpolating between CurrentHex and
    /// TargetHex. RandomState is a per-unit RNG so units that arrive at
    /// the same hex on the same tick still pick different next directions
    /// (no herd lockstep).
    /// </summary>
    public struct UnitMovement : IComponentData
    {
        public int2 CurrentHex;
        public int2 TargetHex;
        public float MoveSpeed;   // world units / second
        public byte Facing;       // mirrors UnitFacingVisual
        public uint RandomState;  // per-unit xorshift state
        public uint WanderStep;   // monotonic counter, advances each arrival
        // Time remaining (seconds) the unit stands still at its current hex
        // after arriving. Lets the sprite-facing flip happen while stationary,
        // so a 90°/180° turn reads as a deliberate pause-then-walk instead of
        // a teleport-flip.
        public float DwellTimer;
        // Last hex-neighbour direction (0..5) the unit moved in. Lets the
        // wander pick bias toward "continue forward" instead of uniform-
        // random ping-ponging. 255 = no previous direction (uniform pick).
        public byte LastDir;
        // The WanderStep value at which this unit harvested its current hex.
        // Lets HarvestSystem fire exactly once per arrival without needing a
        // separate event tag — when LastHarvestStep != WanderStep the unit
        // hasn't harvested THIS stop yet.
        public uint LastHarvestStep;
        public float HarvestCooldown;
    }

    /// <summary>Per-unit intra-hex world-space offset assigned by HexSlotAssignSystem. Units sharing a TargetHex get unique slots via rank-by-Entity.Index so their sprites never land on the same pixel; UnitMovementSystem walks to HexToWorld(targetHex) + Value instead of the raw hex centre. Seeded zero on missing units so first-frame behaviour is identical to the center-of-hex default.</summary>
    public struct HexSlotOffset : IComponentData
    {
        public float2 Value;
    }
}
