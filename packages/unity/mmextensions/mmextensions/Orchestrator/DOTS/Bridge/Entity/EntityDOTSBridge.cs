using System;
using UnityEngine;
using VContainer;
using OneJS;
using R3;
using ObservableCollections;
using KBVE.MMExtensions.Orchestrator.DOTS;
using Unity.Mathematics;
using Unity.Collections.LowLevel.Unsafe;
using Unity.Collections;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Bridge
{
    /// <summary>
    /// Universal DOTS Bridge that handles any entity type through EntityViewModel
    /// </summary>
    public partial class EntityDOTSBridge : MonoBehaviour, IDisposable
    {
        public static EntityViewModel EntityVM { get; private set; }

        [Inject] EntityViewModel _vm;
        private readonly CompositeDisposable _comp = new();

        // Cache flag constants
        private const byte FLAG_HARVESTABLE = (byte)ResourceFlags.IsHarvestable;
        private const byte FLAG_DEPLETED = (byte)ResourceFlags.IsDepleted;

        // Reuse byte array to avoid allocations
        private byte[] _ulidBuffer = new byte[16];

        // Universal EntityBlit properties
        [EventfulProperty] byte[] _jsUlid = Array.Empty<byte>();
        [EventfulProperty] int _jsEntityType = 0;
        [EventfulProperty] int _jsActionFlags = 0;
        [EventfulProperty] float3 _jsWorldPos = float3.zero;
        [EventfulProperty] bool _jsVisible = false;

        // Resource-specific properties
        [EventfulProperty] byte _jsResourceType = 0;
        [EventfulProperty] byte _jsResourceFlags = 0;
        [EventfulProperty] int _jsResourceAmount = 0;
        [EventfulProperty] int _jsResourceMaxAmount = 0;
        [EventfulProperty] int _jsResourceHarvestYield = 0;
        [EventfulProperty] float _jsResourceHarvestTime = 0f;
        [EventfulProperty] bool _jsResourceHarvestable = false;

        // Structure-specific properties
        [EventfulProperty] byte _jsStructureType = 0;
        [EventfulProperty] byte _jsStructureLevel = 0;
        [EventfulProperty] int _jsStructureHealth = 0;
        [EventfulProperty] int _jsStructureMaxHealth = 0;
        [EventfulProperty] float _jsStructureProductionRate = 0f;
        [EventfulProperty] float _jsStructureProductionProgress = 0f;

        // Combatant-specific properties
        [EventfulProperty] byte _jsCombatantType = 0;
        [EventfulProperty] byte _jsCombatantLevel = 0;
        [EventfulProperty] int _jsCombatantHealth = 0;
        [EventfulProperty] int _jsCombatantMaxHealth = 0;
        [EventfulProperty] float _jsCombatantAttackDamage = 0f;
        [EventfulProperty] float _jsCombatantAttackSpeed = 0f;
        [EventfulProperty] float _jsCombatantMoveSpeed = 0f;

        // Item-specific properties
        [EventfulProperty] byte _jsItemType = 0;
        [EventfulProperty] byte _jsItemRarity = 0;
        [EventfulProperty] int _jsItemStackCount = 0;
        [EventfulProperty] int _jsItemMaxStack = 0;

        // Entity type indicators
        [EventfulProperty] bool _jsIsResource = false;
        [EventfulProperty] bool _jsIsStructure = false;
        [EventfulProperty] bool _jsIsCombatant = false;
        [EventfulProperty] bool _jsIsItem = false;

        private void Start()
        {
            EntityVM ??= _vm ?? FindObjectOfType<EntityViewModel>();

            if (EntityVM == null)
            {
                Debug.LogError("EntityDOTSBridge: No EntityViewModel found!");
                return;
            }

            EntityVM.Current
                .Where(static x => x.HasValue)
                .Select(static x => x.Value)
                .ThrottleLastFrame(2)
                .DistinctUntilChanged()
                .ObserveOnMainThread()
                .Subscribe(UpdateUI)
                .AddTo(_comp);

            // Clear UI when no entity selected
            EntityVM.Current
                .Where(static x => !x.HasValue)
                .ObserveOnMainThread()
                .Subscribe(_ => ClearUI())
                .AddTo(_comp);
        }

        private void UpdateUI(EntityBlitContainer container)
        {
            var entity = container.Entity;

            // Universal EntityBlit data
            CopyUlidToBuffer(entity.Ulid, _ulidBuffer);
            JsUlid = _ulidBuffer;
            JsEntityType = (int)entity.Type;
            JsActionFlags = (int)entity.ActionFlags;
            JsWorldPos = entity.WorldPos;

            // Reset all type indicators
            JsIsResource = container.HasResource;
            JsIsStructure = container.HasStructure;
            JsIsCombatant = container.HasCombatant;
            JsIsItem = container.HasItem;

            // Update type-specific data
            if (container.HasResource)
            {
                var resource = container.Resource.Value;
                JsResourceType = resource.Type;
                JsResourceFlags = resource.Flags;
                JsResourceAmount = resource.Amount;
                JsResourceMaxAmount = resource.MaxAmount;
                JsResourceHarvestYield = resource.HarvestYield;
                JsResourceHarvestTime = resource.HarvestTime;
                JsResourceHarvestable = ((resource.Flags & FLAG_HARVESTABLE) != 0)
                                      & (resource.Amount > 0)
                                      & ((resource.Flags & FLAG_DEPLETED) == 0);
            }

            if (container.HasStructure)
            {
                var structure = container.Structure.Value;
                JsStructureType = structure.StructureType;
                JsStructureLevel = structure.Level;
                JsStructureHealth = structure.Health;
                JsStructureMaxHealth = structure.MaxHealth;
                JsStructureProductionRate = structure.ProductionRate;
                JsStructureProductionProgress = structure.ProductionProgress;
            }

            if (container.HasCombatant)
            {
                var combatant = container.Combatant.Value;
                JsCombatantType = combatant.CombatantType;
                JsCombatantLevel = combatant.Level;
                JsCombatantHealth = combatant.Health;
                JsCombatantMaxHealth = combatant.MaxHealth;
                JsCombatantAttackDamage = combatant.AttackDamage;
                JsCombatantAttackSpeed = combatant.AttackSpeed;
                JsCombatantMoveSpeed = combatant.MoveSpeed;
            }

            if (container.HasItem)
            {
                var item = container.Item.Value;
                JsItemType = item.ItemType;
                JsItemRarity = item.Rarity;
                JsItemStackCount = item.StackCount;
                JsItemMaxStack = item.MaxStack;
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