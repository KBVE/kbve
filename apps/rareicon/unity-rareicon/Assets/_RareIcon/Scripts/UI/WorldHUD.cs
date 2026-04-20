using System;
using System.Threading;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.UIElements;
using MessagePipe;
using VContainer;
using VContainer.Unity;
using Cysharp.Text;
using Cysharp.Threading.Tasks;
using R3;

namespace RareIcon
{
    /// <summary>
    /// Bottom-right hover info — visible only in AppInterfaceState.World.
    /// (Renamed from HexInfoPanel; future world-map widgets land here.)
    /// </summary>
    public class WorldHUD : IAsyncStartable, IDisposable
    {
        readonly LocaleService _locale;
        readonly UIPanelManager _panelManager;
        readonly AppStateController _appState;
        readonly UIWorldSearch _worldSearch;
        readonly UITreasury _treasury;
        readonly BuildModeController _buildMode;
        readonly CameraService _camera;
        readonly ISubscriber<HexHoverMessage> _hoverSub;

        readonly CompositeDisposable _disposables = new();

        VisualElement _hoverPanel;
        VisualElement _toolbar;
        Button _buildBtn;
        Label _biomeName;
        Label _hexCoord;
        Label _creatureLine;
        Label _statsLine;
        Label _inventoryLine;
        Label _resourceLine;

        [Inject]
        public WorldHUD(
            LocaleService locale,
            UIPanelManager panelManager,
            AppStateController appState,
            UIWorldSearch worldSearch,
            UITreasury treasury,
            BuildModeController buildMode,
            CameraService camera,
            ISubscriber<HexHoverMessage> hoverSub)
        {
            _locale = locale;
            _panelManager = panelManager;
            _appState = appState;
            _worldSearch = worldSearch;
            _treasury = treasury;
            _buildMode = buildMode;
            _camera = camera;
            _hoverSub = hoverSub;
        }

        public async UniTask StartAsync(CancellationToken cancellation)
        {
            var uiDoc = _panelManager.GetComponent<UIDocument>();
            if (uiDoc == null)
            {
                Debug.LogError("[WorldHUD] UIPanelManager has no UIDocument");
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
                Debug.LogError("[WorldHUD] rootVisualElement still null");
                return;
            }

            BuildUI(uiDoc.rootVisualElement);

            var bag = MessagePipe.DisposableBag.CreateBuilder();
            _hoverSub.Subscribe(OnHexHover).AddTo(bag);
            _disposables.Add(bag.Build());

            _appState.Current
                .Subscribe(state =>
                {
                    var display = state == AppInterfaceState.World ? DisplayStyle.Flex : DisplayStyle.None;
                    _hoverPanel.style.display = display;
                    _toolbar.style.display = display;
                })
                .AddTo(_disposables);
        }

        void BuildUI(VisualElement root)
        {
            BuildHoverPanel(root);
            BuildToolbar(root);
        }

        void BuildHoverPanel(VisualElement root)
        {
            // Bottom-right hover info — black + gold chrome via UIStyles.
            // pickingMode=Ignore on every label keeps world clicks unblocked.
            _hoverPanel = new VisualElement().ApplyPanelChrome();
            _hoverPanel.style.AnchorBottomRight();
            _hoverPanel.style.minWidth = 160;
            _hoverPanel.pickingMode = PickingMode.Ignore;

            _biomeName = UIStyles.MakeHeading("---", fontSize: 18);
            _biomeName.style.marginBottom = 4;
            _biomeName.pickingMode = PickingMode.Ignore;

            _hexCoord = MakeHoverLabel(UIStyles.Palette.TextMuted, fontSize: 13);

            _creatureLine = MakeHoverLabel(UIStyles.Palette.TextCreature, fontSize: 14);
            _creatureLine.style.marginTop = 4;
            _creatureLine.style.unityFontStyleAndWeight = FontStyle.Bold;

            _statsLine     = MakeHoverLabel(UIStyles.Palette.TextStat,      fontSize: 12);
            _statsLine.style.marginTop = 2;

            _inventoryLine = MakeHoverLabel(UIStyles.Palette.TextInventory, fontSize: 12);
            _inventoryLine.style.marginTop = 2;

            _resourceLine  = MakeHoverLabel(UIStyles.Palette.TextResource,  fontSize: 13);
            _resourceLine.style.marginTop = 4;

            _hoverPanel.Add(_biomeName);
            _hoverPanel.Add(_hexCoord);
            _hoverPanel.Add(_creatureLine);
            _hoverPanel.Add(_statsLine);
            _hoverPanel.Add(_inventoryLine);
            _hoverPanel.Add(_resourceLine);
            root.Add(_hoverPanel);
        }

        // Hover-panel labels share three traits — colored, sized, and
        // non-blocking. Single helper so adding a new line is one call.
        static Label MakeHoverLabel(Color color, int fontSize)
        {
            var l = new Label("");
            l.style.color = color;
            l.style.fontSize = fontSize;
            l.pickingMode = PickingMode.Ignore;
            return l;
        }

        void BuildToolbar(VisualElement root)
        {
            // Top-left toolbar — Search · Build · King · Treasury. Flex row
            // so future tools slot in. Each button is a YoRHA-style toggle
            // (dark fill + gold text + hover invert) via UIStyles.
            _toolbar = new VisualElement();
            _toolbar.style.AnchorTopLeft();
            _toolbar.style.flexDirection = FlexDirection.Row;

            _toolbar.Add(MakeToolbarButton("Search", _worldSearch.Toggle, marginLeft: 0));

            _buildBtn = MakeToolbarButton("Build",
                () => _buildMode.Toggle(BuildTarget.Capital), marginLeft: 6);
            _toolbar.Add(_buildBtn);

            // Quick re-center on the player. Common UX in strategy games —
            // click "King" to snap back if you've panned the camera away.
            // Silently no-ops while the King hasn't spawned yet (first frame).
            _toolbar.Add(MakeToolbarButton("King", JumpToKing, marginLeft: 6));

            // Treasury — top-right panel listing capital storage. Toggles
            // open/closed; refreshes itself while visible (UITreasury polls
            // the EntityManager every 500ms so deposits / withdrawals
            // appear in near real-time).
            _toolbar.Add(MakeToolbarButton("Treasury", _treasury.Toggle, marginLeft: 6));

            // Reactive highlight — gold-fill the Build button while active.
            // Reuses the YoRHA hover-invert palette (Gold / Zinc950) so the
            // active state matches what a hover would produce.
            _buildMode.Target
                .Subscribe(target =>
                {
                    bool active = target != BuildTarget.None;
                    _buildBtn.style.backgroundColor = active
                        ? UIStyles.Palette.Gold
                        : UIStyles.Palette.ButtonBg;
                    _buildBtn.style.color = active
                        ? UIStyles.Palette.Zinc950
                        : UIStyles.Palette.Gold;
                    _buildBtn.text = active ? "Build (on)" : "Build";
                })
                .AddTo(_disposables);

            root.Add(_toolbar);
        }

        // Single toolbar button factory — YoRHA chrome plus our 28px height
        // / 6px gap convention. marginLeft=0 for the first button so the
        // toolbar doesn't shift right of its anchor.
        static Button MakeToolbarButton(string text, System.Action onClick, float marginLeft)
        {
            var btn = UIStyles.MakeYorhaButton(text, onClick);
            btn.style.height = 28;
            btn.style.fontSize = 13;
            btn.style.Padding(0, 12);
            btn.style.marginLeft = marginLeft;
            return btn;
        }

        // Single-button callsite for "where is the King?" → inlines the
        // DOTS query instead of routing through a KingLocator static.
        // Two managed calls (world lookup, one-entity query) per click
        // is cheaper than the static-cache churn, and keeps UI → ECS
        // glue visible where it happens rather than hidden in a helper.
        void JumpToKing()
        {
            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;

            var em = world.EntityManager;
            using var query = em.CreateEntityQuery(
                ComponentType.ReadOnly<KingTag>(),
                ComponentType.ReadOnly<LocalTransform>());
            if (query.CalculateEntityCount() == 0) return;  // pre-spawn

            using var arr = query.ToEntityArray(Allocator.Temp);
            var t = em.GetComponentData<LocalTransform>(arr[0]);
            _camera.JumpTo(new float2(t.Position.x, t.Position.y));
        }

        void OnHexHover(HexHoverMessage msg)
        {
            if (_biomeName == null) return;

            _biomeName.text = msg.IsLand
                ? _locale.GetBiomeName(msg.BiomeId)
                : _locale.Get("hex.empty");

            _hexCoord.text = ZString.Format("{0} ({1}, {2})", _locale.Get("hex.coord"), msg.Q, msg.R);

            if (msg.UnitType != UnitType.None)
            {
                _creatureLine.text = _locale.GetCreatureName(msg.UnitType);
                _creatureLine.style.display = DisplayStyle.Flex;

                // Stats line — only includes stats the unit actually carries
                // (Max == 0 → not present → skipped). Floats rounded for HUD.
                var sb = ZString.CreateStringBuilder();
                try
                {
                    AppendStat(ref sb, "HP", msg.UnitHealth, msg.UnitMaxHealth);
                    AppendStat(ref sb, "EN", msg.UnitEnergy, msg.UnitMaxEnergy);
                    AppendStat(ref sb, "MP", msg.UnitMana,   msg.UnitMaxMana);
                    if (sb.Length > 0)
                    {
                        _statsLine.text = sb.ToString();
                        _statsLine.style.display = DisplayStyle.Flex;
                    }
                    else
                    {
                        _statsLine.style.display = DisplayStyle.None;
                    }
                }
                finally { sb.Dispose(); }
            }
            else
            {
                _creatureLine.style.display = DisplayStyle.None;
                _statsLine.style.display = DisplayStyle.None;
            }

            // Inventory line — first 4 slots from HexHoverSystem's sweep.
            // Empty slots have ItemId == 0 and are skipped by AppendInvSlot.
            bool anyInv = (msg.UnitInvCount0 | msg.UnitInvCount1 |
                           msg.UnitInvCount2 | msg.UnitInvCount3) != 0;
            if (msg.UnitType != UnitType.None && anyInv)
            {
                var sb = ZString.CreateStringBuilder();
                try
                {
                    AppendInvSlot(ref sb, msg.UnitInvId0, msg.UnitInvCount0);
                    AppendInvSlot(ref sb, msg.UnitInvId1, msg.UnitInvCount1);
                    AppendInvSlot(ref sb, msg.UnitInvId2, msg.UnitInvCount2);
                    AppendInvSlot(ref sb, msg.UnitInvId3, msg.UnitInvCount3);
                    _inventoryLine.text = sb.ToString();
                }
                finally { sb.Dispose(); }
                _inventoryLine.style.display = DisplayStyle.Flex;
            }
            else
            {
                _inventoryLine.style.display = DisplayStyle.None;
            }

            if (msg.IsLand && (msg.Wood | msg.Stone | msg.Berries | msg.Mushrooms | msg.Herbs | msg.Cactus) != 0)
            {
                // ZString builder appends mutate the struct, so it can't be a
                // 'using var' (refs to using-vars are illegal). Manual dispose.
                var sb = ZString.CreateStringBuilder();
                try
                {
                    AppendResource(ref sb, msg.Wood,      ResourceType.Wood);
                    AppendResource(ref sb, msg.Stone,     ResourceType.Stone);
                    AppendResource(ref sb, msg.Berries,   ResourceType.Berries);
                    AppendResource(ref sb, msg.Mushrooms, ResourceType.Mushrooms);
                    AppendResource(ref sb, msg.Herbs,     ResourceType.Herbs);
                    AppendResource(ref sb, msg.Cactus,    ResourceType.Cactus, msg.CactusVariant);
                    _resourceLine.text = sb.ToString();
                }
                finally
                {
                    sb.Dispose();
                }
                _resourceLine.style.display = DisplayStyle.Flex;
            }
            else
            {
                _resourceLine.style.display = DisplayStyle.None;
            }
        }

        void AppendResource(ref Utf16ValueStringBuilder sb, byte amount, byte type, byte variant = 0)
        {
            if (amount == 0) return;
            if (sb.Length > 0) sb.Append('\n');
            var label = (type == ResourceType.Cactus && variant != CactusVariantType.None)
                ? _locale.GetCactusLabel(variant)
                : _locale.GetResourceName(type);
            sb.Append(label);
            sb.Append(": ");
            sb.Append(amount);
        }

        // Appends "Name × Count" — skips empty slots (ItemId == 0) so the
        // sparse 4-slot snapshot displays cleanly.
        void AppendInvSlot(ref Utf16ValueStringBuilder sb, ushort itemId, ushort count)
        {
            if (itemId == 0 || count == 0) return;
            if (sb.Length > 0) sb.Append(", ");
            sb.Append(_locale.GetItemName(itemId));
            sb.Append(" \u00D7 ");
            sb.Append(count);
        }

        // Appends "LABEL Value/Max" — values rounded to ints for HUD display
        // even though the underlying floats are exact. Skips entirely when the
        // unit doesn't carry the stat (max == 0).
        static void AppendStat(ref Utf16ValueStringBuilder sb, string label, float value, float max)
        {
            if (max <= 0f) return;
            if (sb.Length > 0) sb.Append("  ");
            sb.Append(label);
            sb.Append(' ');
            sb.Append((int)Mathf.Round(value));
            sb.Append('/');
            sb.Append((int)Mathf.Round(max));
        }

        public void Dispose()
        {
            _disposables?.Dispose();
        }
    }
}
