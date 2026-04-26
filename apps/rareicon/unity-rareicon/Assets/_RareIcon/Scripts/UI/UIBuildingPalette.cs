using System;
using System.Threading;
using Cysharp.Text;
using Cysharp.Threading.Tasks;
using MessagePipe;
using R3;
using Unity.Entities;
using UnityEngine;
using UnityEngine.UIElements;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Build palette — lists every buildable type with cost + live affordability. Refreshes rows on InventoryChangedMessage filtered by Capital.</summary>
    public class UIBuildingPalette : IAsyncStartable, IDisposable
    {
        readonly LocaleService _locale;
        readonly UIPanelManager _panelManager;
        readonly BuildModeController _buildMode;
        readonly ISubscriber<InventoryChangedMessage> _inventorySub;

        readonly CompositeDisposable _disposables = new();
        readonly ReactiveProperty<bool> _isOpen = new(false);
        public ReadOnlyReactiveProperty<bool> IsOpen => _isOpen;

        VisualElement _root, _panel, _rowsHost;
        Row[] _rows;

        [Inject]
        public UIBuildingPalette(LocaleService locale, UIPanelManager panelManager, BuildModeController buildMode,
                                 ISubscriber<InventoryChangedMessage> inventorySub)
        {
            _locale        = locale;
            _panelManager  = panelManager;
            _buildMode     = buildMode;
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

            _root = UIPanelLoader.Load(uiDoc, "UI/Palette");
            if (_root == null) return;

            var wrapper  = _root.Q<VisualElement>("palette-wrapper");
            _panel       = wrapper; // toggle hides the whole modal (backdrop + panel)
            var card     = _root.Q<VisualElement>("palette-root");
            var backdrop = _root.Q<VisualElement>("palette-backdrop");
            _rowsHost    = _root.Q<VisualElement>("palette-rows");
            _root.Q<Label>("palette-title").text  = _locale.Get("palette.title");
            _root.Q<Button>("palette-close").clicked += Close;
            backdrop.RegisterCallback<ClickEvent>(_ => Close());
            card.RegisterCallback<ClickEvent>(e => e.StopPropagation());

            _rows = new Row[BuildingDB.AllBuildable.Length];
            for (int i = 0; i < _rows.Length; i++)
            {
                byte type = BuildingDB.AllBuildable[i];
                _rows[i] = new Row(type, _locale, OnRowClicked);
                _rowsHost.Add(_rows[i].Element);
            }

            _isOpen.Subscribe(open =>
            {
                if (open) { _panel.RemoveFromClassList("is-hidden"); _root.BringToFront(); Refresh(); }
                else      _panel.AddToClassList("is-hidden");
            }).AddTo(_disposables);

            var bag = MessagePipe.DisposableBag.CreateBuilder();
            _inventorySub.Subscribe(OnInventoryChanged).AddTo(bag);
            _disposables.Add(bag.Build());

            _buildMode.Target.Subscribe(target =>
            {
                if (_rows == null) return;
                for (int i = 0; i < _rows.Length; i++)
                    _rows[i].SetSelected(_rows[i].BuildingType == BuildingDB.BuildTargetToType(target));
            }).AddTo(_disposables);
        }

        public void Toggle() => _isOpen.Value = !_isOpen.Value;
        public void Open()   => _isOpen.Value = true;
        public void Close()  => _isOpen.Value = false;

        void OnRowClicked(byte buildingType)
        {
            byte target = BuildingDB.BuildingTypeToTarget(buildingType);
            if (_buildMode.Target.CurrentValue == target)
            {
                _buildMode.Exit();
            }
            else
            {
                _buildMode.Toggle(target);
                Close();
            }
        }

        void Refresh()
        {
            if (_rows == null) return;
            World world = null;
            foreach (var w in World.All)
            {
                if (!w.IsCreated) continue;
                using var q = w.EntityManager.CreateEntityQuery(ComponentType.ReadOnly<KingTag>());
                if (!q.IsEmpty) { world = w; break; }
            }
            if (world == null) world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;
            for (int i = 0; i < _rows.Length; i++) _rows[i].Refresh(em);
        }

        void OnInventoryChanged(InventoryChangedMessage msg)
        {
            if (!_isOpen.Value) return;
            Refresh();
        }

        public void Dispose()
        {
            _disposables?.Dispose();
        }

        // -- Per-building row — a row VisualElement with name + cost labels,
        // refreshed in place on each poll. --
        sealed class Row
        {
            public readonly byte BuildingType;
            public readonly VisualElement Element;
            readonly Label _nameLabel;
            readonly Label _costLabel;
            readonly LocaleService _locale;
            readonly Action<byte> _onClick;

            public Row(byte buildingType, LocaleService locale, Action<byte> onClick)
            {
                BuildingType = buildingType;
                _locale = locale;
                _onClick = onClick;

                Element = new VisualElement();
                Element.AddToClassList("palette-row");
                Element.RegisterCallback<ClickEvent>(_ => _onClick(BuildingType));

                _nameLabel = new Label(locale.Get(BuildingDB.GetLocaleKey(buildingType)));
                _nameLabel.AddToClassList("palette-row__name");
                Element.Add(_nameLabel);

                _costLabel = new Label(string.Empty);
                _costLabel.AddToClassList("palette-row__cost");
                Element.Add(_costLabel);
            }

            public void SetSelected(bool selected)
            {
                if (selected) Element.AddToClassList("is-selected");
                else          Element.RemoveFromClassList("is-selected");
            }

            public void Refresh(EntityManager em)
            {
                bool affordable = HasAllIngredients(em, BuildingType);

                var sb = ZString.CreateStringBuilder();
                try
                {
                    var cost = BuildingDB.GetCost(BuildingType);
                    for (int i = 0; i < cost.Length; i++)
                    {
                        if (sb.Length > 0) sb.Append(", ");
                        sb.Append(cost[i].Amount);
                        sb.Append(' ');
                        sb.Append(_locale.GetItemName(cost[i].ItemId));
                    }
                    _costLabel.text = sb.ToString();
                }
                finally { sb.Dispose(); }

                if (!affordable) _costLabel.AddToClassList("palette-row__cost--unaffordable");
                else             _costLabel.RemoveFromClassList("palette-row__cost--unaffordable");
            }

            static bool HasAllIngredients(EntityManager em, byte buildingType)
            {
                var cost = BuildingDB.GetCost(buildingType);
                if (BuildingDB.GetCostSource(buildingType) == BuildingDB.CostSource.KingInventory)
                {
                    var q = em.CreateEntityQuery(ComponentType.ReadOnly<KingTag>());
                    if (q.CalculateEntityCount() == 0) { q.Dispose(); return false; }
                    var arr = q.ToEntityArray(Unity.Collections.Allocator.Temp);
                    Entity king = arr[0];
                    arr.Dispose();
                    q.Dispose();
                    if (!em.HasBuffer<PackSlot>(king)) return false;
                    var pack = em.GetBuffer<PackSlot>(king);
                    for (int i = 0; i < cost.Length; i++)
                        if (!ItemSlotOps.HasBuildCost(pack, cost[i].ItemId, cost[i].Amount)) return false;
                    return true;
                }

                Entity capital = Entity.Null;
                {
                    var q = em.CreateEntityQuery(ComponentType.ReadOnly<Building>());
                    if (q.CalculateEntityCount() == 0) { q.Dispose(); return false; }
                    var arr = q.ToEntityArray(Unity.Collections.Allocator.Temp);
                    try
                    {
                        for (int i = 0; i < arr.Length; i++)
                        {
                            if (em.GetComponentData<Building>(arr[i]).Type == RareIcon.BuildingType.Capital)
                            {
                                capital = arr[i];
                                break;
                            }
                        }
                    }
                    finally { arr.Dispose(); }
                    q.Dispose();
                }
                if (capital == Entity.Null) return false;
                if (!em.HasBuffer<CapitalLedger>(capital)) return false;
                var inv = em.GetBuffer<CapitalLedger>(capital).Reinterpret<BankLedgerBase>();
                for (int i = 0; i < cost.Length; i++)
                    if (!BankLedgerOps.HasBuildCost(inv, cost[i].ItemId, cost[i].Amount)) return false;
                return true;
            }

        }
    }
}
