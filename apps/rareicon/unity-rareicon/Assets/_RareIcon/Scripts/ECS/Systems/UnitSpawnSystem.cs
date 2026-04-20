using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.Rendering;

namespace RareIcon
{
    /// <summary>
    /// Optional state passed to <see cref="UnitSpawnSystem.SpawnGoblinAt"/>
    /// when re-materializing a ghost unit from the persistent world store.
    /// All fields default to "use NPCDB / empty" so the initial spawn path
    /// can pass <c>default</c> and behave the same as before.
    /// </summary>
    public struct UnitSpawnState
    {
        // Health.Value at restore time. Negative or zero → use NPCDB max.
        public float Health;
        public float MaxHealth;
        // First 4 inventory slots. ItemId == 0 means empty slot.
        public ushort Inv0Id, Inv0Qty;
        public ushort Inv1Id, Inv1Qty;
        public ushort Inv2Id, Inv2Qty;
        public ushort Inv3Id, Inv3Qty;
    }

    /// <summary>
    /// Spawns the initial goblin cluster around origin and exposes a public
    /// static <see cref="SpawnGoblinAt"/> so HexChunkSystem can re-materialize
    /// ghost units pulled from the Rust persistence store on chunk reload.
    ///
    /// Render assets (mesh, material, RenderMeshArray) live in static fields
    /// behind a lazy initializer so both the initial OnUpdate spawn AND
    /// per-chunk ghost restores share one set of GPU resources.
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial class UnitSpawnSystem : SystemBase
    {
        const float HexSize = 0.25f;
        const float UnitSize = 0.5f;   // matches hex bounding box → pixel-scale parity
        const int   GoblinCount  = 16;
        const int   SpawnRadius  = 8;  // hexes from origin (square footprint)

        // -- Static render assets --
        // Lazy-initialized on first spawn (OnUpdate or external SpawnGoblinAt
        // call). Shared across all goblin entities so we don't allocate a
        // material per chunk reload.
        static Mesh                  _mesh;
        static Material              _material;
        static RenderMeshDescription _renderDesc;
        static RenderMeshArray       _renderArray;
        static bool                  _renderAssetsReady;

        bool _spawned;

        protected override void OnUpdate()
        {
            if (_spawned) return;
            _spawned = true;

            if (!EnsureRenderAssets()) return;

            // The King spawns at origin first so ghost-restore (which keys
            // off the King entity) has something to find from frame one.
            SpawnKingAt(EntityManager, new int2(0, 0));

            // Deterministic scatter — each index hashes to a hex offset within
            // [-SpawnRadius, +SpawnRadius]² so we get a recognisable cluster
            // around origin instead of a single test entity. Goblins are now
            // Player faction (allies of the King) — combat lands when we add
            // a real Hostile faction (bandits / undead / etc.).
            for (int i = 0; i < GoblinCount; i++)
            {
                uint h = (uint)(i + 1) * 0x9E3779B1u;
                h ^= h >> 13;
                h *= 0x85EBCA77u;
                int span = SpawnRadius * 2 + 1;
                int q = (int)(h % (uint)span) - SpawnRadius;
                int r = (int)((h >> 16) % (uint)span) - SpawnRadius;
                // Mix in a second hash for the per-unit RNG seed so adjacent
                // goblins get different wander streams.
                uint rng = h * 0xC2B2AE3Du ^ ((uint)i * 0x27D4EB2Fu);
                SpawnGoblinAt(EntityManager, new int2(q, r), rng);
            }

            Debug.Log($"[UnitSpawnSystem] Spawned King at origin + {GoblinCount} ally goblins");
        }

        /// <summary>
        /// Spawn a goblin entity at the given hex coord. Public + static so
        /// chunk-load code can re-materialize ghost units pulled from the
        /// Rust store. Pass <paramref name="state"/> to restore health and
        /// inventory; pass <c>default</c> for a fresh spawn (NPCDB defaults).
        /// </summary>
        public static Entity SpawnGoblinAt(EntityManager em, int2 hex, uint rngSeed,
                                           UnitSpawnState state = default)
        {
            if (!EnsureRenderAssets()) return Entity.Null;

            // All defaults pulled from NPCDB so spawn code stays generic — to
            // spawn a different creature later, swap UnitType.Goblin for the
            // new ID and the same code path picks up its stats / weapon.
            var def = NPCDB.Get(UnitType.Goblin);

            var entity = em.CreateEntity();

            float3 worldPos = HexMeshUtil.HexToWorld(hex.x, hex.y, HexSize);
            // Above hex plane and above river decals (z = -0.5), below modal UI.
            worldPos.z = -0.7f;

            em.AddComponentData(entity, LocalTransform.FromPosition(worldPos));
            em.AddComponentData(entity, new Unit
            {
                Type   = def.UnitType,
                Weapon = def.DefaultWeapon,
            });

            // Stats — only attach what NPCDB says the creature carries (Max=0
            // → skip the component entirely so archetypes stay tight). Ghost-
            // restore overrides the current value if state was passed.
            if (def.MaxHealth > 0)
            {
                float maxHp = state.MaxHealth > 0f ? state.MaxHealth : def.MaxHealth;
                float hp    = state.Health    > 0f ? state.Health    : maxHp;
                em.AddComponentData(entity, new Health { Value = hp, Max = maxHp });
                if (def.HealthRegen != 0f)
                    em.AddComponentData(entity, new HealthRegen { PerSecond = def.HealthRegen });
            }
            if (def.MaxEnergy > 0)
            {
                em.AddComponentData(entity, new Energy { Value = def.MaxEnergy, Max = def.MaxEnergy });
                if (def.EnergyRegen != 0f)
                    em.AddComponentData(entity, new EnergyRegen { PerSecond = def.EnergyRegen });
            }
            if (def.MaxMana > 0)
            {
                em.AddComponentData(entity, new Mana { Value = def.MaxMana, Max = def.MaxMana });
                if (def.ManaRegen != 0f)
                    em.AddComponentData(entity, new ManaRegen { PerSecond = def.ManaRegen });
            }

            em.AddComponentData(entity, new UnitVisual        { Value = (float)def.UnitType });
            em.AddComponentData(entity, new UnitWeaponVisual  { Value = (float)def.DefaultWeapon });
            em.AddComponentData(entity, new UnitFacingVisual  { Value = (float)UnitFacing.East });
            em.AddComponentData(entity, new UnitMovingVisual  { Value = 1f }); // wandering by default

            // Faction + collider — goblins are Player allies (the King's
            // retainers / scouts). Combat lands when we add a real Hostile
            // faction (bandits / undead / etc.) for them to fight.
            // Collidable radius is chosen to comfortably cover the
            // visible sprite so arrows land reliably at pixel scale.
            em.AddComponentData(entity, new Faction    { Value = FactionType.Player });
            em.AddComponentData(entity, new Collidable { Radius = 0.20f });

            // Per-unit speed jitter ~ ±20% around the def's base move speed
            // → some goblins amble, others stride, crowd reads as individuals.
            float speedJit = 0.8f + ((rngSeed >> 8) & 0xFFu) / 255f * 0.4f;
            em.AddComponentData(entity, new UnitMovement
            {
                CurrentHex  = hex,
                TargetHex   = hex,
                MoveSpeed   = def.MoveSpeed * speedJit,
                Facing      = UnitFacing.East,
                RandomState = rngSeed | 1u,
                WanderStep  = 0u,
                DwellTimer  = (rngSeed % 100u) / 200f,
                LastDir     = 255,
                LastHarvestStep = uint.MaxValue, // != WanderStep so first arrival can harvest
            });

            // Empty goal — WanderBehaviorSystem picks it up on the
            // first tick and rolls a random target so the goblin
            // starts walking. ReturnToBase / player orders override
            // as conditions change. Attach to every unit so the
            // Behavior→Pathfinding→Locomotion split has a component
            // to write to.
            em.AddComponentData(entity, new MovementGoal
            {
                Kind      = GoalKind.None,
                Priority  = GoalPriority.None,
                TargetHex = hex,
            });

            // Inventory — populated from state if any slot has a non-zero item
            // (ghost-restore path); otherwise an empty buffer that
            // HarvestSystem will fill as the unit wanders onto resources.
            var inv = em.AddBuffer<InventorySlot>(entity);
            if (state.Inv0Id != 0 && state.Inv0Qty > 0) inv.Add(new InventorySlot { ItemId = state.Inv0Id, Count = state.Inv0Qty });
            if (state.Inv1Id != 0 && state.Inv1Qty > 0) inv.Add(new InventorySlot { ItemId = state.Inv1Id, Count = state.Inv1Qty });
            if (state.Inv2Id != 0 && state.Inv2Qty > 0) inv.Add(new InventorySlot { ItemId = state.Inv2Id, Count = state.Inv2Qty });
            if (state.Inv3Id != 0 && state.Inv3Qty > 0) inv.Add(new InventorySlot { ItemId = state.Inv3Id, Count = state.Inv3Qty });

            em.AddComponent<UnitTestTag>(entity);

            RenderMeshUtility.AddComponents(
                entity, em, _renderDesc, _renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));

            return entity;
        }

        /// <summary>
        /// Spawn the player-controlled King at the given hex. There should be
        /// exactly one King in the world at any time (caller responsibility).
        /// Visually a Soldier base + Cap helmet (Crown) — proper King-specific
        /// shader with jeweled crown / royal robes is a polish pass.
        /// </summary>
        public static Entity SpawnKingAt(EntityManager em, int2 hex,
                                         UnitSpawnState state = default)
        {
            if (!EnsureRenderAssets()) return Entity.Null;

            var def = NPCDB.Get(UnitType.King);

            var entity = em.CreateEntity();

            float3 worldPos = HexMeshUtil.HexToWorld(hex.x, hex.y, HexSize);
            worldPos.z = -0.7f;

            em.AddComponentData(entity, LocalTransform.FromPosition(worldPos));
            em.AddComponentData(entity, new Unit
            {
                Type   = def.UnitType,           // mechanically a King…
                Weapon = def.DefaultWeapon,
            });

            // Stats — King carries HP/Energy/Mana per NPCDB.
            float maxHp = state.MaxHealth > 0f ? state.MaxHealth : def.MaxHealth;
            float hp    = state.Health    > 0f ? state.Health    : maxHp;
            em.AddComponentData(entity, new Health     { Value = hp,            Max = maxHp });
            em.AddComponentData(entity, new HealthRegen { PerSecond = def.HealthRegen });
            em.AddComponentData(entity, new Energy     { Value = def.MaxEnergy, Max = def.MaxEnergy });
            em.AddComponentData(entity, new EnergyRegen { PerSecond = def.EnergyRegen });
            em.AddComponentData(entity, new Mana       { Value = def.MaxMana,   Max = def.MaxMana });
            em.AddComponentData(entity, new ManaRegen  { PerSecond = def.ManaRegen });

            // …visually a Soldier with a (gold-tinted) Cap helmet. Setting
            // UnitVisual.Value = King would give the shader an unknown unit
            // type and draw nothing, so we override here. UnitWeaponVisual
            // stays None for v1; royal sceptre / royal sword land later.
            em.AddComponentData(entity, new UnitVisual        { Value = (float)UnitType.Soldier });
            em.AddComponentData(entity, new UnitWeaponVisual  { Value = (float)WeaponType.None });
            em.AddComponentData(entity, new UnitFacingVisual  { Value = (float)UnitFacing.East });
            em.AddComponentData(entity, new UnitHelmetVisual  { Value = (float)HelmetType.Cap });
            em.AddComponentData(entity, new UnitMovingVisual  { Value = 0f }); // King spawns at rest

            em.AddComponentData(entity, new Faction    { Value = FactionType.Player });
            em.AddComponentData(entity, new Collidable { Radius = 0.22f });

            // Movement: target = current so the King stays put until
            // the player issues an order. WanderBehaviorSystem skips
            // the King because we also attach a KingTag and WanderJob
            // filters it out (see WithNone<KingTag> on the wander job).
            em.AddComponentData(entity, new UnitMovement
            {
                CurrentHex      = hex,
                TargetHex       = hex,
                MoveSpeed       = def.MoveSpeed,
                Facing          = UnitFacing.East,
                RandomState     = 0xC0FFEE01u, // any non-zero seed; King doesn't wander
                WanderStep      = 0u,
                DwellTimer      = 0f,
                LastDir         = 255,
                LastHarvestStep = uint.MaxValue,
            });

            // Empty goal — KingMoveCommandSystem will populate this on
            // the player's first click. ReturnToBaseSystem can also
            // drive it home when the King is carrying items / hungry,
            // sharing the auto-return code path with goblins.
            em.AddComponentData(entity, new MovementGoal
            {
                Kind      = GoalKind.None,
                Priority  = GoalPriority.None,
                TargetHex = hex,
            });

            var inv = em.AddBuffer<InventorySlot>(entity);
            if (state.Inv0Id != 0 && state.Inv0Qty > 0) inv.Add(new InventorySlot { ItemId = state.Inv0Id, Count = state.Inv0Qty });
            if (state.Inv1Id != 0 && state.Inv1Qty > 0) inv.Add(new InventorySlot { ItemId = state.Inv1Id, Count = state.Inv1Qty });
            if (state.Inv2Id != 0 && state.Inv2Qty > 0) inv.Add(new InventorySlot { ItemId = state.Inv2Id, Count = state.Inv2Qty });
            if (state.Inv3Id != 0 && state.Inv3Qty > 0) inv.Add(new InventorySlot { ItemId = state.Inv3Id, Count = state.Inv3Qty });

            em.AddComponent<KingTag>(entity);

            RenderMeshUtility.AddComponents(
                entity, em, _renderDesc, _renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));

            return entity;
        }

        // Lazily creates the shared render assets the first time anything
        // tries to spawn a goblin. Returns false if the shader is missing.
        static bool EnsureRenderAssets()
        {
            if (_renderAssetsReady) return true;

            var shader = Shader.Find("RareIcon/HexUnit");
            if (shader == null)
            {
                Debug.LogError("[UnitSpawnSystem] HexUnit shader not found");
                return false;
            }

            _mesh = CreateQuadMesh(UnitSize);
            _material = new Material(shader) { enableInstancing = true };
            _renderDesc = new RenderMeshDescription(
                shadowCastingMode: ShadowCastingMode.Off,
                receiveShadows: false);
            _renderArray = new RenderMeshArray(new[] { _material }, new[] { _mesh });

            _renderAssetsReady = true;
            return true;
        }

        // Flat XY quad centered at origin — UV maps [0,1] across the quad,
        // which the HexUnit shader quantizes to its pixel grid.
        static Mesh CreateQuadMesh(float size)
        {
            float half = size * 0.5f;
            var mesh = new Mesh
            {
                vertices = new[]
                {
                    new Vector3(-half, -half, 0f),
                    new Vector3( half, -half, 0f),
                    new Vector3( half,  half, 0f),
                    new Vector3(-half,  half, 0f),
                },
                uv = new[]
                {
                    new Vector2(0, 0), new Vector2(1, 0),
                    new Vector2(1, 1), new Vector2(0, 1),
                },
                triangles = new[] { 0, 2, 1, 0, 3, 2 },
            };
            mesh.RecalculateBounds();
            return mesh;
        }
    }
}
