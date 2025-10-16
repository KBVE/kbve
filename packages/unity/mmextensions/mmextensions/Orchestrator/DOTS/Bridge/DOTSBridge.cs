using System;
using UnityEngine;
using VContainer;
using OneJS;
using R3;
using ObservableCollections;
using KBVE.MMExtensions.Orchestrator.DOTS;
using KBVE.MMExtensions.Orchestrator.DOTS.Common;
using Unity.Mathematics;
using Unity.Collections.LowLevel.Unsafe;
using Unity.Collections;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Bridge
{
    /// <summary>
    /// Universal DOTS Bridge that handles any entity type through EntityViewModel.
    /// Consolidated from EntityDOTSBridge to replace resource-specific functionality.
    /// </summary>
    public partial class DOTSBridge : MonoBehaviour, IDisposable
    {
        public static EntityViewModel EntityVM { get; private set; }

        [Inject] EntityViewModel _vm;
        private readonly CompositeDisposable _comp = new();

        // Cache flag constants
        private const byte FLAG_HARVESTABLE = (byte)ResourceFlags.IsHarvestable;
        private const byte FLAG_DEPLETED = (byte)ResourceFlags.IsDepleted;

        // Reuse byte array to avoid allocations
        private byte[] _ulidBuffer = new byte[16];

        // Universal EntityData properties
        [EventfulProperty] byte[] _jsUlid = Array.Empty<byte>();
        [EventfulProperty] int _jsEntityType = 0;
        [EventfulProperty] int _jsActionFlags = 0;
        [EventfulProperty] float _jsWorldPosX = 0f;
        [EventfulProperty] float _jsWorldPosY = 0f;
        [EventfulProperty] float _jsWorldPosZ = 0f;
        [EventfulProperty] bool _jsVisible = false;

        // Resource-specific properties
        [EventfulProperty] int _jsResourceType = 0;      // Changed to int for enum
        [EventfulProperty] int _jsResourceFlags = 0;     // Changed to int for enum flags
        [EventfulProperty] int _jsResourceAmount = 0;
        [EventfulProperty] int _jsResourceMaxAmount = 0;
        [EventfulProperty] int _jsResourceHarvestYield = 0;
        [EventfulProperty] float _jsResourceHarvestTime = 0f;
        [EventfulProperty] bool _jsResourceHarvestable = false;

        // Structure-specific properties
        [EventfulProperty] int _jsStructureType = 0;     // Changed to int for enum
        [EventfulProperty] int _jsStructureLevel = 0;    // Changed to int to match data
        [EventfulProperty] int _jsStructureHealth = 0;
        [EventfulProperty] int _jsStructureMaxHealth = 0;
        [EventfulProperty] float _jsStructureProductionRate = 0f;
        [EventfulProperty] float _jsStructureProductionProgress = 0f;

        // Combatant-specific properties
        [EventfulProperty] int _jsCombatantType = 0;     // Changed to int for enum
        [EventfulProperty] int _jsCombatantLevel = 0;    // Changed to int to match data
        [EventfulProperty] int _jsCombatantHealth = 0;
        [EventfulProperty] int _jsCombatantMaxHealth = 0;
        [EventfulProperty] float _jsCombatantAttackDamage = 0f;
        [EventfulProperty] float _jsCombatantAttackSpeed = 0f;
        [EventfulProperty] float _jsCombatantMoveSpeed = 0f;

        // Item-specific properties
        [EventfulProperty] int _jsItemType = 0;          // Changed to int for enum
        [EventfulProperty] int _jsItemRarity = 0;        // Changed to int for enum
        [EventfulProperty] int _jsItemStackCount = 0;
        [EventfulProperty] int _jsItemMaxStack = 0;

        // Player-specific properties
        [EventfulProperty] int _jsPlayerLevel = 0;       // Changed to int to match data
        [EventfulProperty] int _jsPlayerExperience = 0;
        [EventfulProperty] int _jsPlayerHealth = 0;
        [EventfulProperty] int _jsPlayerMaxHealth = 0;
        [EventfulProperty] int _jsPlayerMana = 0;
        [EventfulProperty] int _jsPlayerMaxMana = 0;

        // Entity type indicators
        [EventfulProperty] bool _jsIsResource = false;
        [EventfulProperty] bool _jsIsStructure = false;
        [EventfulProperty] bool _jsIsCombatant = false;
        [EventfulProperty] bool _jsIsItem = false;
        [EventfulProperty] bool _jsIsPlayer = false;

        private void Start()
        {
            // Debug logging to help identify the issue
            Debug.Log($"DOTSBridge Start: _vm = {(_vm != null ? "Found" : "NULL")}, Instance = {(EntityViewModel.Instance != null ? "Found" : "NULL")}");

            EntityVM = _vm ?? EntityViewModel.Instance;

            // Create EntityViewModel if none exists (this will set the static Instance)
            if (EntityVM == null)
            {
                Debug.Log("DOTSBridge: Creating EntityViewModel instance.");
                EntityVM = new EntityViewModel();
            }

            Debug.Log("DOTSBridge: EntityViewModel successfully configured.");

            EntityVM.Current
                .Do(x => Debug.Log($"DOTSBridge: EntityVM.Current received data - HasResource={x.HasResource}, HasStructure={x.HasStructure}, HasCombatant={x.HasCombatant}, HasItem={x.HasItem}, HasPlayer={x.HasPlayer}"))
                .Where(static x => x.HasResource || x.HasStructure || x.HasCombatant || x.HasItem || x.HasPlayer) // Has valid entity data
                .Do(x => Debug.Log($"DOTSBridge: Data passed filter - HasResource={x.HasResource}, HasStructure={x.HasStructure}, HasCombatant={x.HasCombatant}, HasItem={x.HasItem}, HasPlayer={x.HasPlayer}"))
                .ThrottleLastFrame(2)
                .DistinctUntilChanged()
                .ObserveOnMainThread()
                .Subscribe(UpdateUI)
                .AddTo(_comp);

            // Clear UI when no entity selected
            EntityVM.Current
                .Where(static x => !x.HasResource && !x.HasStructure && !x.HasCombatant && !x.HasItem && !x.HasPlayer) // No valid entity data
                .ObserveOnMainThread()
                .Subscribe(_ => ClearUI())
                .AddTo(_comp);
        }

        private void UpdateUI(EntityBlitContainer container)
        {
            EntityData entityData = container.EntityData;
            Debug.Log($"DOTSBridge UpdateUI: Received container with HasResource={container.HasResource}, HasStructure={container.HasStructure}, HasCombatant={container.HasCombatant}, HasItem={container.HasItem}, HasPlayer={container.HasPlayer}");

            // Universal EntityData
            CopyUlidToBuffer(entityData.Ulid, _ulidBuffer);
            JsUlid = _ulidBuffer;
            JsEntityType = (int)entityData.Type;
            JsActionFlags = (int)entityData.ActionFlags;
            JsWorldPosX = entityData.WorldPos.x;
            JsWorldPosY = entityData.WorldPos.y;
            JsWorldPosZ = entityData.WorldPos.z;
            JsVisible = true;

            // Reset all type indicators
            JsIsResource = container.HasResource;
            JsIsStructure = container.HasStructure;
            JsIsCombatant = container.HasCombatant;
            JsIsItem = container.HasItem;
            JsIsPlayer = container.HasPlayer;

            // Update type-specific data
            if (container.HasResource)
            {
                var resource = container.Resource;
                JsResourceType = (int)resource.Type;
                JsResourceFlags = (int)resource.Flags;
                JsResourceAmount = resource.Amount;
                JsResourceMaxAmount = resource.MaxAmount;
                JsResourceHarvestYield = resource.HarvestYield;
                JsResourceHarvestTime = resource.HarvestTime;
                JsResourceHarvestable = ((resource.Flags & (ResourceFlags)FLAG_HARVESTABLE) != 0)
                                      & (resource.Amount > 0)
                                      & ((resource.Flags & (ResourceFlags)FLAG_DEPLETED) == 0);

                Debug.Log($"DOTSBridge: Set resource properties - Type={JsResourceType}, Amount={JsResourceAmount}, MaxAmount={JsResourceMaxAmount}, Harvestable={JsResourceHarvestable}");
            }

            if (container.HasStructure)
            {
                var structure = container.Structure;
                JsStructureType = (int)structure.Type;          // Fixed field name and cast
                JsStructureLevel = structure.Level;
                JsStructureHealth = structure.Health;
                JsStructureMaxHealth = structure.MaxHealth;
                JsStructureProductionRate = structure.ProductionRate;
                JsStructureProductionProgress = structure.ProductionProgress;
            }

            if (container.HasCombatant)
            {
                var combatant = container.Combatant;
                JsCombatantType = (int)combatant.Type;           // Fixed field name and cast
                JsCombatantLevel = combatant.Level;
                JsCombatantHealth = combatant.Health;
                JsCombatantMaxHealth = combatant.MaxHealth;
                JsCombatantAttackDamage = combatant.AttackDamage;
                JsCombatantAttackSpeed = combatant.AttackSpeed;
                JsCombatantMoveSpeed = combatant.MoveSpeed;
            }

            if (container.HasItem)
            {
                var item = container.Item;
                JsItemType = (int)item.Type;                 // Fixed field name and cast
                JsItemRarity = (int)item.Rarity;
                JsItemStackCount = item.StackCount;
                JsItemMaxStack = item.MaxStack;
            }

            if (container.HasPlayer)
            {
                var player = container.Player;
                JsPlayerLevel = player.Level;
                JsPlayerExperience = player.Experience;
                JsPlayerHealth = player.Health;
                JsPlayerMaxHealth = player.MaxHealth;
                JsPlayerMana = player.Mana;
                JsPlayerMaxMana = player.MaxMana;
            }

            JsVisible = true;
        }

        private void ClearUI()
        {
            JsVisible = false;
            JsIsResource = false;
            JsIsStructure = false;
            JsIsCombatant = false;
            JsIsItem = false;
            JsIsPlayer = false;
        }

        private static unsafe void CopyUlidToBuffer(FixedBytes16 ulid, byte[] buffer)
        {
            fixed (byte* destPtr = buffer)
            {
                byte* srcPtr = (byte*)UnsafeUtility.AddressOf(ref ulid);
                UnsafeUtility.MemCpy(destPtr, srcPtr, 16);
            }
        }

        public void Dispose() => _comp.Dispose();

        private void OnDestroy() => Dispose();
    }
}