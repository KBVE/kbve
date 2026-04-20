using System;
using System.Threading;
using Cysharp.Text;
using Cysharp.Threading.Tasks;
using R3;
using Unity.Entities;
using UnityEngine;
using UnityEngine.UIElements;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>
    /// Build menu — top-right panel listing every <see cref="BuildingType"/>
    /// with its cost line and live affordability state. Replaces the old
    /// hardcoded "Build → Capital" toolbar binding: clicking a row sets
    /// the active <see cref="BuildModeController.Target"/> so the player
    /// places that building type on the next hex click.
    ///
    /// Affordability check refreshes every 500ms while open — same poll
    /// cadence as the Treasury panel. Unaffordable rows show muted text
    /// and the "Insufficient" label, but stay clickable (so the player
    /// can still enter build mode and see the red preview tint when the
    /// cost source ticks up later).
    /// </summary>
    public class UIBuildingPalette : IAsyncStartable, IDisposable
    {
        const int RefreshIntervalMs = 500;

        readonly LocaleService _locale;
        readonly UIPanelManager _panelManager;
        readonly BuildModeController _buildMode;

        readonly CompositeDisposable _disposables = new();
        readonly ReactiveProperty<bool> _isOpen = new(false);
        public ReadOnlyReactiveProperty<bool> IsOpen => _isOpen;

        VisualElement _root;
        Row[] _rows;
        IVisualElementScheduledItem _refreshTick;

        [Inject]
        public UIBuildingPalette(
            LocaleService locale,
            UIPanelManager panelManager,
            BuildModeController buildMode)
        {
            _locale       = locale;
            _panelManager = panelManager;
            _buildMode    = buildMode;
        }

        public async UniTask StartAsync(CancellationToken cancellation)
        {
            var uiDoc = _panelManager.GetComponent<UIDocument>();
            if (uiDoc == null)
            {
                Debug.LogError("[UIBuildingPalette] UIPanelManager has no UIDocument");
                return;
            }

            int waited = 0;
            while (uiDoc.rootVisualElement == null && waited < 1000)
            {
                await UniTask.Delay(50, cancellationToken: cancellation);
                waited += 50;
            }
            if (uiDoc.rootVisualElement == null)
            {
                Debug.LogError("[UIBuildingPalette] rootVisualElement still null");
                return;
            }

            BuildUI(uiDoc.rootVisualElement);

            _isOpen
                .Subscribe(open =>
                {
                    _root.style.display = open ? DisplayStyle.Flex : DisplayStyle.None;
                    if (open)
                    {
                        Refresh();
                        _refreshTick = _root.schedule.Execute(Refresh).Every(RefreshIntervalMs);
                    }
                    else
                    {
                        _refreshTick?.Pause();
                        _refreshTick = null;
                    }
                })
                .AddTo(_disposables);

            // Mirror the BuildModeController target — when the player
            // hits Escape (BuildInputSource.Exit) the panel should
            // also close so the toolbar state stays coherent.
            _buildMode.Target
                .Subscribe(target =>
                {
                    if (target == BuildTarget.None && _isOpen.Value) return;
                    // Highlight the matching row when a target is active.
                    if (_rows == null) return;
                    for (int i = 0; i < _rows.Length; i++)
                        _rows[i].SetSelected(_rows[i].BuildingType
                                             == BuildingDB.BuildTargetToType(target));
                })
                .AddTo(_disposables);
        }

        public void Toggle() => _isOpen.Value = !_isOpen.Value;
        public void Open()   => _isOpen.Value = true;
        public void Close()  => _isOpen.Value = false;

        void BuildUI(VisualElement parent)
        {
            // Top-right anchor — sits below the Treasury panel position
            // when both are open (Treasury is also top-right; player can
            // just close one to see the other for v1, future could
            // stagger via a side-panel registry).
            _root = new VisualElement().ApplyPanelChrome();
            _root.style.AnchorTopRight();
            _root.style.minWidth = UIStyles.PanelWidth.StdMin;
            _root.style.maxWidth = new Length(UIStyles.VwMaxPct.Std, LengthUnit.Percent);
            _root.style.display = DisplayStyle.None;
            _root.RegisterCallback<ClickEvent>(e => e.StopPropagation());

            UIStyles.MakePanelHeader(_root, _locale.Get("palette.title"), Close);

            // Building rows — one per BuildingDB.AllBuildable entry.
            _rows = new Row[BuildingDB.AllBuildable.Length];
            for (int i = 0; i < _rows.Length; i++)
            {
                byte type = BuildingDB.AllBuildable[i];
                _rows[i] = new Row(type, _locale, OnRowClicked);
                _root.Add(_rows[i].Element);
            }

            parent.Add(_root);
        }

        void OnRowClicked(byte buildingType)
        {
            // Selecting a row enters build mode for that type. If the
            // same type is already active, treat it as a deselect (toggle).
            byte target = BuildingDB.BuildingTypeToTarget(buildingType);
            if (_buildMode.Target.CurrentValue == target)
                _buildMode.Exit();
            else
                _buildMode.Toggle(target);
        }

        // Walk every row and refresh its cost / affordability state
        // against the current King + Capital inventories.
        void Refresh()
        {
            if (_rows == null) return;
            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;

            for (int i = 0; i < _rows.Length; i++)
                _rows[i].Refresh(em);
        }

        public void Dispose()
        {
            _refreshTick?.Pause();
            _refreshTick = null;
            _disposables?.Dispose();
        }

        // -- Per-building row --
        // One UI line per buildable type. Caches its label refs so
        // Refresh() only mutates strings + colors, no allocation.
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
                Element.style.flexDirection = FlexDirection.Column;
                Element.style.Padding(UIStyles.Spacing.Sm, UIStyles.Spacing.Md);
                Element.style.marginBottom = UIStyles.Spacing.Xs;
                Element.style.BorderRadius(UIStyles.Radius.Sharp);
                Element.style.BorderWidth(1);
                Element.style.BorderColor(UIStyles.Palette.BorderSubtle);
                Element.style.backgroundColor = UIStyles.Palette.Zinc900;
                Element.RegisterCallback<ClickEvent>(_ => _onClick(BuildingType));

                _nameLabel = new Label(locale.Get(BuildingDB.GetLocaleKey(buildingType)));
                _nameLabel.style.color = UIStyles.Palette.TextStrong;
                _nameLabel.style.fontSize = UIStyles.Type.Label;
                _nameLabel.style.unityFontStyleAndWeight = FontStyle.Bold;
                Element.Add(_nameLabel);

                _costLabel = new Label("");
                _costLabel.style.color = UIStyles.Palette.TextMuted;
                _costLabel.style.fontSize = UIStyles.Type.Body;
                _costLabel.style.marginTop = UIStyles.Spacing.Xs;
                _costLabel.style.whiteSpace = WhiteSpace.Normal;
                Element.Add(_costLabel);
            }

            public void SetSelected(bool selected)
            {
                Element.style.BorderColor(selected
                    ? UIStyles.Palette.Gold
                    : UIStyles.Palette.BorderSubtle);
                Element.style.backgroundColor = selected
                    ? UIStyles.Palette.Zinc800
                    : UIStyles.Palette.Zinc900;
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
                    if (!affordable)
                    {
                        if (sb.Length > 0) sb.Append("  \u2022  ");
                        sb.Append(_locale.Get("palette.unaffordable"));
                    }
                    _costLabel.text = sb.ToString();
                }
                finally { sb.Dispose(); }

                _costLabel.style.color = affordable
                    ? UIStyles.Palette.TextMuted
                    : UIStyles.Palette.Alert;
                _nameLabel.style.color = affordable
                    ? UIStyles.Palette.TextStrong
                    : UIStyles.Palette.GoldMuted;
            }

            // Mirrors BuildPreviewSystem's cost check — single source of
            // truth would be nicer, but extracting it requires a refactor
            // since the preview system also touches tile state. Worth a
            // helper in BuildingDB once a 3rd consumer (inspector panel?)
            // appears.
            static bool HasAllIngredients(EntityManager em, byte buildingType)
            {
                if (!TryFindCostSourceInventory(em, buildingType, out var inv)) return false;
                var cost = BuildingDB.GetCost(buildingType);
                for (int i = 0; i < cost.Length; i++)
                {
                    int total = 0;
                    for (int j = 0; j < inv.Length; j++)
                        if (inv[j].ItemId == cost[i].ItemId) total += inv[j].Count;
                    if (total < cost[i].Amount) return false;
                }
                return true;
            }

            static bool TryFindCostSourceInventory(EntityManager em, byte buildingType,
                                                   out DynamicBuffer<InventorySlot> inv)
            {
                inv = default;
                Entity source = Entity.Null;

                if (BuildingDB.GetCostSource(buildingType) == BuildingDB.CostSource.KingInventory)
                {
                    var q = em.CreateEntityQuery(ComponentType.ReadOnly<KingTag>());
                    if (q.CalculateEntityCount() == 0) return false;
                    var arr = q.ToEntityArray(Unity.Collections.Allocator.Temp);
                    source = arr[0];
                    arr.Dispose();
                }
                else
                {
                    var q = em.CreateEntityQuery(ComponentType.ReadOnly<Building>());
                    if (q.CalculateEntityCount() == 0) return false;
                    var arr = q.ToEntityArray(Unity.Collections.Allocator.Temp);
                    try
                    {
                        for (int i = 0; i < arr.Length; i++)
                        {
                            if (em.GetComponentData<Building>(arr[i]).Type == RareIcon.BuildingType.Capital)
                            {
                                source = arr[i];
                                break;
                            }
                        }
                    }
                    finally { arr.Dispose(); }
                    if (source == Entity.Null) return false;
                }

                if (!em.HasBuffer<InventorySlot>(source)) return false;
                inv = em.GetBuffer<InventorySlot>(source);
                return true;
            }
        }
    }
}
