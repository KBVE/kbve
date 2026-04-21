using System;
using System.Threading;
using Cysharp.Text;
using Cysharp.Threading.Tasks;
using MessagePipe;
using R3;
using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;
using UnityEngine.UIElements;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Bottom-left panel that shows the building the player just clicked. Refreshes on InventoryChangedMessage filtered by the currently-inspected entity.</summary>
    public class UIBuildingInspector : IAsyncStartable, IDisposable
    {
        readonly LocaleService _locale;
        readonly UIPanelManager _panelManager;
        readonly ISubscriber<BuildingInspectMessage> _inspectSub;
        readonly ISubscriber<InventoryChangedMessage> _inventorySub;

        readonly CompositeDisposable _disposables = new();
        readonly ReactiveProperty<bool> _isOpen = new(false);
        public ReadOnlyReactiveProperty<bool> IsOpen => _isOpen;

        VisualElement _root, _panel;
        Label _titleLabel, _ownerLabel, _healthLabel, _productionLabel, _storageLabel;
        Button _releaseBtn, _demolishBtn;
        Entity _target;

        [Inject]
        public UIBuildingInspector(LocaleService locale, UIPanelManager panelManager,
                                   ISubscriber<BuildingInspectMessage> inspectSub,
                                   ISubscriber<InventoryChangedMessage> inventorySub)
        {
            _locale        = locale;
            _panelManager  = panelManager;
            _inspectSub    = inspectSub;
            _inventorySub  = inventorySub;
        }

        public async UniTask StartAsync(CancellationToken cancellation)
        {
            var uiDoc = _panelManager.GetComponent<UIDocument>();
            if (uiDoc == null) return;

            int waited = 0;
            while (uiDoc.rootVisualElement == null && waited < 1000)
            {
                await UniTask.Delay(50, cancellationToken: cancellation);
                waited += 50;
            }
            if (uiDoc.rootVisualElement == null) return;

            _root = UIPanelLoader.Load(uiDoc, "UI/Inspector");
            if (_root == null) return;

            _panel           = _root.Q<VisualElement>("inspector-root");
            _titleLabel      = _root.Q<Label>("inspector-title");
            _ownerLabel      = _root.Q<Label>("inspector-owner");
            _healthLabel     = _root.Q<Label>("inspector-health");
            _productionLabel = _root.Q<Label>("inspector-production");
            _storageLabel    = _root.Q<Label>("inspector-storage");
            _releaseBtn      = _root.Q<Button>("inspector-release");
            _demolishBtn     = _root.Q<Button>("inspector-demolish");

            _titleLabel.text = _locale.Get("inspector.title");
            _releaseBtn.text = _locale.Get("inspector.release_king");
            _releaseBtn.clicked += RequestRelease;
            if (_demolishBtn != null)
            {
                _demolishBtn.text = _locale.Get("inspector.demolish");
                _demolishBtn.clicked += RequestDemolish;
            }
            _root.Q<Button>("inspector-close").clicked += Close;

            // Stop the panel's clicks from falling through to the map below.
            _panel.RegisterCallback<ClickEvent>(e => e.StopPropagation());

            var bag = MessagePipe.DisposableBag.CreateBuilder();
            _inspectSub.Subscribe(OnInspect).AddTo(bag);
            _inventorySub.Subscribe(OnInventoryChanged).AddTo(bag);
            _disposables.Add(bag.Build());

            _isOpen.Subscribe(open =>
            {
                if (open) { _panel.RemoveFromClassList("is-hidden"); Refresh(); }
                else      _panel.AddToClassList("is-hidden");
            }).AddTo(_disposables);
        }

        void OnInventoryChanged(InventoryChangedMessage msg)
        {
            if (!_isOpen.Value) return;
            if (_target == Entity.Null) return;
            if (msg.Bank != _target) return;
            Refresh();
        }

        public void Close() => _isOpen.Value = false;

        void OnInspect(BuildingInspectMessage msg)
        {
            if (msg.Building == Entity.Null) return;
            _target = msg.Building;
            _isOpen.Value = true;
            Refresh();
        }

        void RequestRelease()
        {
            if (_target == Entity.Null) return;
            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;
            var req = em.CreateEntity();
            em.AddComponentData(req, new ReleaseShelterRequest { Host = _target });
        }

        void RequestDemolish()
        {
            if (_target == Entity.Null) return;
            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;
            if (!em.HasComponent<Building>(_target)) return;
            if (em.GetComponentData<Building>(_target).Type == BuildingType.Capital) return;
            var req = em.CreateEntity();
            em.AddComponentData(req, new DemolishRequest { Target = _target });
            Close();
        }

        void Refresh()
        {
            if (_titleLabel == null) return;
            if (_target == Entity.Null) return;
            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;

            if (!em.Exists(_target) || !em.HasComponent<Building>(_target))
            {
                _isOpen.Value = false;
                _target = Entity.Null;
                return;
            }

            var b = em.GetComponentData<Building>(_target);
            _titleLabel.text = _locale.Get(BuildingDB.GetLocaleKey(b.Type));

            var ownerSb = ZString.CreateStringBuilder();
            try
            {
                ownerSb.Append(_locale.Get("inspector.owner"));
                ownerSb.Append(": ");
                ownerSb.Append(_locale.GetFactionName(b.OwnerFaction));
                ownerSb.Append("  \u2022  ");
                ownerSb.Append(_locale.Get("hex.coord"));
                ownerSb.Append(" (");
                ownerSb.Append(b.RootHex.x); ownerSb.Append(", "); ownerSb.Append(b.RootHex.y);
                ownerSb.Append(')');
                _ownerLabel.text = ownerSb.ToString();
            }
            finally { ownerSb.Dispose(); }

            float now = TryGetClockSeconds(em);
            RefreshHealth(em);
            RefreshProduction(em, now);
            RefreshStorage(em);
            RefreshReleaseButton(em);
        }

        static void SetHidden(VisualElement el, bool hidden)
        {
            if (hidden) el.AddToClassList("is-hidden");
            else        el.RemoveFromClassList("is-hidden");
        }

        void RefreshReleaseButton(EntityManager em)
        {
            bool hasResident = false;
            using var q = em.CreateEntityQuery(ComponentType.ReadOnly<ShelteredInside>());
            using var entities = q.ToEntityArray(Unity.Collections.Allocator.Temp);
            for (int i = 0; i < entities.Length; i++)
            {
                if (em.GetComponentData<ShelteredInside>(entities[i]).Host == _target)
                {
                    hasResident = true;
                    break;
                }
            }
            SetHidden(_releaseBtn, !hasResident);
        }

        void RefreshHealth(EntityManager em)
        {
            if (!em.HasComponent<BuildingHealth>(_target))
            {
                SetHidden(_healthLabel, true);
                _healthLabel.text = string.Empty;
                return;
            }
            var hp = em.GetComponentData<BuildingHealth>(_target);
            var sb = ZString.CreateStringBuilder();
            try
            {
                sb.Append(_locale.Get("inspector.health"));
                sb.Append(' ');
                sb.Append(hp.Value); sb.Append('/'); sb.Append(hp.Max);
                _healthLabel.text = sb.ToString();
            }
            finally { sb.Dispose(); }
            bool wounded = hp.Max > 0 && hp.Value * 2 < hp.Max;
            if (wounded) _healthLabel.AddToClassList("text-danger");
            else         _healthLabel.RemoveFromClassList("text-danger");
            SetHidden(_healthLabel, false);
        }

        void RefreshProduction(EntityManager em, float now)
        {
            var sb = ZString.CreateStringBuilder();
            try
            {
                if (em.HasBuffer<ProductionRecipe>(_target))
                {
                    var recipes = em.GetBuffer<ProductionRecipe>(_target);
                    AppendProductionHeader(ref sb);
                    for (int i = 0; i < recipes.Length; i++)
                    {
                        if (i > 0) sb.Append('\n');
                        var r = recipes[i];
                        AppendInputs(ref sb, r.Input1Id, r.Input1Amount, r.Input2Id, r.Input2Amount, r.Input3Id, r.Input3Amount);
                        sb.Append(" \u2192 ");
                        AppendOutputs(ref sb, r.Output1Id, r.Output1Amount, r.Output2Id, r.Output2Amount, r.Output3Id, r.Output3Amount);
                        AppendCycle(ref sb, r.CycleEndsAt, r.CycleDuration, now);
                    }
                    if (em.HasComponent<TenderMultiplier>(_target))
                    {
                        float t = em.GetComponentData<TenderMultiplier>(_target).Value;
                        if (t > 0f)
                        {
                            sb.Append('\n'); sb.Append(_locale.Get("inspector.tender_bonus"));
                            sb.Append(": +"); sb.Append((int)Mathf.Round(t * 50f)); sb.Append('%');
                        }
                    }
                }
                else if (em.HasComponent<FurnaceProduction>(_target))
                {
                    var p = em.GetComponentData<FurnaceProduction>(_target);
                    AppendProductionHeader(ref sb);
                    AppendInputs(ref sb, p.Input1Id, p.Input1Amount, p.Input2Id, p.Input2Amount, 0, 0);
                    sb.Append(" \u2192 ");
                    AppendOutputs(ref sb, p.Output1Id, p.Output1Amount, p.Output2Id, p.Output2Amount, p.Output3Id, p.Output3Amount);
                    AppendCycle(ref sb, p.CycleEndsAt, p.CycleDuration, now);
                }
                else if (em.HasComponent<PassiveProduction>(_target))
                {
                    var p = em.GetComponentData<PassiveProduction>(_target);
                    AppendProductionHeader(ref sb);
                    sb.Append("\u2192 ");
                    AppendItemQty(ref sb, p.OutputId, p.OutputAmount);
                    AppendCycle(ref sb, p.CycleEndsAt, p.CycleDuration, now);
                }

                if (sb.Length == 0) { SetHidden(_productionLabel, true); _productionLabel.text = string.Empty; }
                else                 { SetHidden(_productionLabel, false); _productionLabel.text = sb.ToString(); }
            }
            finally { sb.Dispose(); }
        }

        void AppendProductionHeader(ref Utf16ValueStringBuilder sb)
        { sb.Append(_locale.Get("inspector.production")); sb.Append('\n'); }

        void AppendRecipe(ref Utf16ValueStringBuilder sb, ushort inItem, ushort inAmt, ushort outItem, ushort outAmt)
        { AppendItemQty(ref sb, inItem, inAmt); sb.Append(" \u2192 "); AppendItemQty(ref sb, outItem, outAmt); }

        void AppendInputs(ref Utf16ValueStringBuilder sb, ushort i1, ushort a1, ushort i2, ushort a2, ushort i3, ushort a3)
        {
            bool any = false;
            if (a1 > 0) { AppendItemQty(ref sb, i1, a1); any = true; }
            if (a2 > 0) { if (any) sb.Append(" + "); AppendItemQty(ref sb, i2, a2); any = true; }
            if (a3 > 0) { if (any) sb.Append(" + "); AppendItemQty(ref sb, i3, a3); }
        }

        void AppendOutputs(ref Utf16ValueStringBuilder sb, ushort o1, ushort a1, ushort o2, ushort a2, ushort o3, ushort a3)
        {
            bool any = false;
            if (a1 > 0) { AppendItemQty(ref sb, o1, a1); any = true; }
            if (a2 > 0) { if (any) sb.Append(" + "); AppendItemQty(ref sb, o2, a2); any = true; }
            if (a3 > 0) { if (any) sb.Append(" + "); AppendItemQty(ref sb, o3, a3); }
        }

        void AppendItemQty(ref Utf16ValueStringBuilder sb, ushort itemId, ushort amount)
        { sb.Append(amount); sb.Append(' '); sb.Append(_locale.GetItemName(itemId)); }

        void AppendCycle(ref Utf16ValueStringBuilder sb, float cycleEndsAt, float duration, float now)
        {
            sb.Append('\n');
            if (cycleEndsAt <= 0f || duration <= 0f) { sb.Append(_locale.Get("inspector.idle")); return; }
            float remaining = math.max(0f, cycleEndsAt - now);
            float elapsed   = math.max(0f, duration - remaining);
            sb.Append(_locale.Get("inspector.cycle"));
            sb.Append(' '); sb.Append((int)Mathf.Round(elapsed));
            sb.Append("s / "); sb.Append((int)Mathf.Round(duration)); sb.Append('s');
        }

        void RefreshStorage(EntityManager em)
        {
            // Read whichever per-bank ledger this building entity carries.
            // Five types to check; all share BankLedgerBase layout so we
            // reinterpret once and iterate the common shape.
            DynamicBuffer<BankLedgerBase> slots = default;
            bool hasSlots = false;
            if (em.HasBuffer<CapitalLedger>(_target))      { slots = em.GetBuffer<CapitalLedger>(_target).Reinterpret<BankLedgerBase>(); hasSlots = true; }
            else if (em.HasBuffer<FurnaceLedger>(_target)) { slots = em.GetBuffer<FurnaceLedger>(_target).Reinterpret<BankLedgerBase>(); hasSlots = true; }
            else if (em.HasBuffer<FarmLedger>(_target))    { slots = em.GetBuffer<FarmLedger>(_target).Reinterpret<BankLedgerBase>();    hasSlots = true; }
            else if (em.HasBuffer<BarracksLedger>(_target)){ slots = em.GetBuffer<BarracksLedger>(_target).Reinterpret<BankLedgerBase>();hasSlots = true; }
            else if (em.HasBuffer<GoblinCaveLedger>(_target)){ slots = em.GetBuffer<GoblinCaveLedger>(_target).Reinterpret<BankLedgerBase>(); hasSlots = true; }

            if (!hasSlots)
            { SetHidden(_storageLabel, true); _storageLabel.text = string.Empty; return; }

            var sb = ZString.CreateStringBuilder();
            try
            {
                sb.Append(_locale.Get("inspector.storage")); sb.Append('\n');
                int written = 0;
                for (int i = 0; i < slots.Length; i++)
                {
                    var s = slots[i];
                    if (s.ItemId == 0 || s.Count == 0) continue;
                    if (written > 0) sb.Append('\n');
                    sb.Append(_locale.GetItemName(s.ItemId));
                    sb.Append(" \u00D7 "); sb.Append(s.Count);
                    written++;
                }
                if (written == 0) sb.Append(_locale.Get("inspector.empty"));
                SetHidden(_storageLabel, false);
                _storageLabel.text = sb.ToString();
            }
            finally { sb.Dispose(); }
        }

        static float TryGetClockSeconds(EntityManager em)
        {
            using var q = em.CreateEntityQuery(ComponentType.ReadOnly<WorldClock>());
            return q.CalculateEntityCount() == 0 ? 0f : q.GetSingleton<WorldClock>().AbsSeconds;
        }

        public void Dispose()
        {
            _disposables?.Dispose();
        }
    }
}
