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
        readonly UICitizensPanel _citizensPanel;
        readonly UIBuildingPalette _buildingPalette;
        readonly BuildModeController _buildMode;
        readonly CameraService _camera;
        readonly ISubscriber<HexHoverMessage> _hoverSub;

        readonly CompositeDisposable _disposables = new();

        VisualElement _hoverPanel;
        VisualElement _toolbar;
        VisualElement _clockPanel;
        Label _clockTurnLabel;
        Label _clockTimeLabel;
        VisualElement _clockIcon;
        Button _buildBtn;
        Label _biomeName;
        Label _hexCoord;
        Label _creatureLine;
        Label _statsLine;
        Label _inventoryLine;
        Label _resourceLine;
        VisualElement _controlPanel;
        Label _controlLabel;
        Label _controlActivityLabel;
        Button _releaseBtn;
        IDisposable _controlActivitySub;
        EntityQuery _clockQuery;
        EntityQuery _controlledQuery;
        bool _clockQueryReady;
        bool _controlledQueryReady;
        Entity _lastControlled;
        byte _lastControlledType;

        readonly ActivityFeedService _activity;

        [Inject]
        public WorldHUD(
            LocaleService locale,
            UIPanelManager panelManager,
            AppStateController appState,
            UIWorldSearch worldSearch,
            UITreasury treasury,
            UICitizensPanel citizensPanel,
            UIBuildingPalette buildingPalette,
            BuildModeController buildMode,
            CameraService camera,
            ActivityFeedService activity,
            ISubscriber<HexHoverMessage> hoverSub)
        {
            _locale = locale;
            _panelManager = panelManager;
            _appState = appState;
            _worldSearch = worldSearch;
            _treasury = treasury;
            _citizensPanel = citizensPanel;
            _buildingPalette = buildingPalette;
            _buildMode = buildMode;
            _camera = camera;
            _activity = activity;
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
                    _clockPanel.style.display = display;
                    _controlPanel.style.display = display;
                })
                .AddTo(_disposables);

            _clockPanel.schedule.Execute(RefreshClock).Every(250);
            _controlPanel.schedule.Execute(RefreshControlIndicator).Every(250);
            RefreshClock();
            RefreshControlIndicator();
        }

        void BuildUI(VisualElement root)
        {
            BuildHoverPanel(root);
            BuildToolbar(root);
            BuildClockPanel(root);
            BuildControlPanel(root);
        }

        void BuildClockPanel(VisualElement root)
        {
            _clockPanel = new VisualElement().ApplyPanelChromeCompact();
            _clockPanel.style.position = Position.Absolute;
            _clockPanel.style.top = new Length(2f, LengthUnit.Percent);
            _clockPanel.style.left = new Length(50f, LengthUnit.Percent);
            _clockPanel.style.translate = new Translate(new Length(-50f, LengthUnit.Percent), 0);
            _clockPanel.style.flexDirection = FlexDirection.Row;
            _clockPanel.style.alignItems = Align.Center;
            _clockPanel.pickingMode = PickingMode.Ignore;

            _clockIcon = new VisualElement();
            _clockIcon.style.width = 10;
            _clockIcon.style.height = 10;
            _clockIcon.style.borderTopLeftRadius = 5;
            _clockIcon.style.borderTopRightRadius = 5;
            _clockIcon.style.borderBottomLeftRadius = 5;
            _clockIcon.style.borderBottomRightRadius = 5;
            _clockIcon.style.backgroundColor = UIStyles.Palette.Gold;
            _clockIcon.style.marginRight = UIStyles.Spacing.Md;
            _clockPanel.Add(_clockIcon);

            _clockTurnLabel = UIStyles.MakeHeading("Turn 0 · Day", fontSize: UIStyles.Type.BodyLg);
            _clockTurnLabel.style.marginRight = UIStyles.Spacing.Md;
            _clockPanel.Add(_clockTurnLabel);

            _clockTimeLabel = new Label("00:00");
            _clockTimeLabel.style.color = UIStyles.Palette.TextMuted;
            _clockTimeLabel.style.fontSize = UIStyles.Type.BodyLg;
            _clockTimeLabel.pickingMode = PickingMode.Ignore;
            _clockPanel.Add(_clockTimeLabel);

            root.Add(_clockPanel);
        }

        void RefreshClock()
        {
            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;

            var em = world.EntityManager;
            if (!_clockQueryReady)
            {
                _clockQuery = em.CreateEntityQuery(ComponentType.ReadOnly<WorldClock>());
                _clockQueryReady = true;
            }

            if (_clockQuery.CalculateEntityCount() == 0) return;
            var clock = _clockQuery.GetSingleton<WorldClock>();

            string phase = clock.IsDay ? "Day" : "Night";
            _clockTurnLabel.text = ZString.Format("Turn {0} · {1}", clock.TurnIndex, phase);

            int totalSec = (int)clock.TurnElapsed;
            int mm = totalSec / 60;
            int ss = totalSec % 60;
            _clockTimeLabel.text = ZString.Format("{0:00}:{1:00}", mm, ss);

            _clockIcon.style.backgroundColor = clock.IsDay
                ? UIStyles.Palette.Gold
                : new Color(0.55f, 0.65f, 0.85f, 1f);
        }

        void BuildControlPanel(VisualElement root)
        {
            _controlPanel = new VisualElement().ApplyPanelChromeCompact();
            _controlPanel.style.position = Position.Absolute;
            _controlPanel.style.top = new Length(7f, LengthUnit.Percent);
            _controlPanel.style.left = new Length(50f, LengthUnit.Percent);
            _controlPanel.style.translate = new Translate(new Length(-50f, LengthUnit.Percent), 0);
            _controlPanel.style.flexDirection = FlexDirection.Column;
            _controlPanel.style.alignItems = Align.Center;

            var topRow = new VisualElement();
            topRow.style.flexDirection = FlexDirection.Row;
            topRow.style.alignItems = Align.Center;

            _controlLabel = new Label(_locale.Get("hud.god_view"));
            _controlLabel.style.color = UIStyles.Palette.TextStrong;
            _controlLabel.style.fontSize = UIStyles.Type.Body;
            _controlLabel.style.marginRight = UIStyles.Spacing.Md;
            topRow.Add(_controlLabel);

            _releaseBtn = UIStyles.MakeButton(_locale.Get("hud.release"), ReleaseControl);
            _releaseBtn.style.height = 18;
            _releaseBtn.style.fontSize = UIStyles.Type.Tiny;
            _releaseBtn.style.Padding(0, UIStyles.Spacing.Md);
            _releaseBtn.style.display = DisplayStyle.None;
            topRow.Add(_releaseBtn);

            _controlPanel.Add(topRow);

            _controlActivityLabel = new Label(string.Empty);
            _controlActivityLabel.style.color = UIStyles.Palette.GoldDeep;
            _controlActivityLabel.style.fontSize = UIStyles.Type.Tiny;
            _controlActivityLabel.style.marginTop = UIStyles.Spacing.Xs;
            _controlActivityLabel.style.display = DisplayStyle.None;
            _controlPanel.Add(_controlActivityLabel);

            root.Add(_controlPanel);
        }

        // Polls the controlled-unit query each tick. Cheap — at most one
        // entity carries ControlledUnitTag and the query is cached. We
        // also short-circuit when the held entity hasn't changed so the
        // string format / ZString allocation only runs on transition.
        void RefreshControlIndicator()
        {
            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;

            if (!_controlledQueryReady)
            {
                _controlledQuery = em.CreateEntityQuery(
                    ComponentType.ReadOnly<ControlledUnitTag>(),
                    ComponentType.ReadOnly<Unit>());
                _controlledQueryReady = true;
            }

            Entity current = Entity.Null;
            byte type = UnitType.None;
            if (_controlledQuery.CalculateEntityCount() > 0)
            {
                using var arr = _controlledQuery.ToEntityArray(Allocator.Temp);
                current = arr[0];
                type = em.GetComponentData<Unit>(current).Type;
            }

            if (current == _lastControlled && type == _lastControlledType) return;
            _lastControlled     = current;
            _lastControlledType = type;

            if (current == Entity.Null)
            {
                _controlLabel.text = _locale.Get("hud.god_view");
                _controlLabel.style.color = UIStyles.Palette.TextMuted;
                _releaseBtn.style.display = DisplayStyle.None;

                // Drop the activity sub-line; god view has no "doing what".
                _controlActivitySub?.Dispose();
                _controlActivitySub = null;
                _controlActivityLabel.style.display = DisplayStyle.None;
                _controlActivityLabel.text = string.Empty;
            }
            else
            {
                // Prefer the per-entity UnitName when present (Player units
                // get one at spawn). Fall back to the creature.* locale
                // label so unnamed possessables (the King, future
                // raid-defectors, etc.) still read cleanly.
                string label = string.Empty;
                if (em.HasComponent<UnitName>(current))
                {
                    var nm = em.GetComponentData<UnitName>(current);
                    label = _locale.GetGoblinName(nm.FirstNameId, nm.EpithetId);
                }
                if (label.Length == 0) label = _locale.GetCreatureName(type);

                _controlLabel.text = ZString.Format(_locale.Get("hud.controlling"), label);
                _controlLabel.style.color = UIStyles.Palette.Gold;
                _releaseBtn.style.display = DisplayStyle.Flex;

                // Resubscribe the activity line to the new controlled entity.
                // R3 dedupes — the label only flips when the writer detects
                // a real activity transition. King carries ActivityState
                // (added in AttachJobsIfPlayer), so this works for any
                // Player unit including the King.
                _controlActivitySub?.Dispose();
                Entity captured = current;
                _controlActivitySub = _activity.For(current).Subscribe(snapshot =>
                {
                    if (_lastControlled != captured) return;
                    string act = _locale.GetActivityName(snapshot.Kind);
                    _controlActivityLabel.text = act.Length > 0 ? act : _locale.Get("activity.idle");
                });
                _controlActivityLabel.style.display = DisplayStyle.Flex;
                // Defensive prime — the writer hasn't necessarily emitted
                // a transition yet on the first take-control frame.
                var snap = _activity.CurrentFor(current);
                string seed = _locale.GetActivityName(snap.Kind);
                _controlActivityLabel.text = seed.Length > 0 ? seed : _locale.Get("activity.idle");
            }
        }

        // Drops ControlledUnitTag from whichever entity holds it and
        // cancels any in-flight Order-priority MovementGoal so the
        // released unit doesn't keep walking toward the player's last
        // click. Returns the player to god view; click any Player-faction
        // unit to repossess.
        void ReleaseControl()
        {
            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;

            using var query = em.CreateEntityQuery(ComponentType.ReadOnly<ControlledUnitTag>());
            if (query.CalculateEntityCount() == 0) return;

            using var arr = query.ToEntityArray(Allocator.Temp);
            for (int i = 0; i < arr.Length; i++)
            {
                em.RemoveComponent<ControlledUnitTag>(arr[i]);
                if (em.HasComponent<MovementGoal>(arr[i]))
                {
                    var g = em.GetComponentData<MovementGoal>(arr[i]);
                    if (g.Priority == GoalPriority.Order)
                        em.SetComponentData(arr[i], default(MovementGoal));
                }
            }

            // Force the indicator to repaint immediately rather than wait
            // for the 250ms tick — feels snappier when the button is hit.
            RefreshControlIndicator();
        }

        void BuildHoverPanel(VisualElement root)
        {
            _hoverPanel = new VisualElement().ApplyPanelChromeCompact();
            _hoverPanel.style.AnchorBottomRight();
            _hoverPanel.style.minWidth = UIStyles.PanelWidth.NarrowMin;
            _hoverPanel.style.maxWidth = new Length(UIStyles.VwMaxPct.Narrow, LengthUnit.Percent);
            _hoverPanel.pickingMode = PickingMode.Ignore;

            _biomeName = UIStyles.MakeHeading("---", fontSize: UIStyles.Type.Heading);
            _biomeName.style.marginBottom = UIStyles.Spacing.Xs;
            _biomeName.pickingMode = PickingMode.Ignore;

            _hexCoord = MakeHoverLabel(UIStyles.Palette.TextMuted, fontSize: UIStyles.Type.Body);

            _creatureLine = MakeHoverLabel(UIStyles.Palette.TextCreature, fontSize: UIStyles.Type.BodyLg);
            _creatureLine.style.marginTop = UIStyles.Spacing.Xs;
            _creatureLine.style.unityFontStyleAndWeight = FontStyle.Bold;

            _statsLine     = MakeHoverLabel(UIStyles.Palette.TextStat,      fontSize: UIStyles.Type.Body);
            _statsLine.style.marginTop = UIStyles.Spacing.Xs;

            _inventoryLine = MakeHoverLabel(UIStyles.Palette.TextInventory, fontSize: UIStyles.Type.Body);
            _inventoryLine.style.marginTop = UIStyles.Spacing.Xs;

            _resourceLine  = MakeHoverLabel(UIStyles.Palette.TextResource,  fontSize: UIStyles.Type.Body);
            _resourceLine.style.marginTop = UIStyles.Spacing.Xs;

            _hoverPanel.Add(_biomeName);
            _hoverPanel.Add(_hexCoord);
            _hoverPanel.Add(_creatureLine);
            _hoverPanel.Add(_statsLine);
            _hoverPanel.Add(_inventoryLine);
            _hoverPanel.Add(_resourceLine);
            root.Add(_hoverPanel);
        }

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
            _toolbar = new VisualElement();
            _toolbar.style.AnchorTopLeft();
            _toolbar.style.flexDirection = FlexDirection.Row;

            _toolbar.Add(MakeToolbarButton("Search", _worldSearch.Toggle, marginLeft: 0));

            _buildBtn = MakeToolbarButton("Build", _buildingPalette.Toggle, marginLeft: UIStyles.Spacing.Sm);
            _toolbar.Add(_buildBtn);

            _toolbar.Add(MakeToolbarButton("King", JumpToKing, marginLeft: UIStyles.Spacing.Sm));
            _toolbar.Add(MakeToolbarButton("Treasury", _treasury.Toggle, marginLeft: UIStyles.Spacing.Sm));
            _toolbar.Add(MakeToolbarButton("Citizens", _citizensPanel.Toggle, marginLeft: UIStyles.Spacing.Sm));

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

        static Button MakeToolbarButton(string text, System.Action onClick, float marginLeft)
        {
            var btn = UIStyles.MakeButton(text, onClick);
            btn.style.height = 20;
            btn.style.fontSize = UIStyles.Type.Body;
            btn.style.Padding(0, UIStyles.Spacing.Md);
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
                    AppendStat(ref sb, "HP", msg.UnitHealth,  msg.UnitMaxHealth);
                    AppendStat(ref sb, "EN", msg.UnitEnergy,  msg.UnitMaxEnergy);
                    AppendStat(ref sb, "MP", msg.UnitMana,    msg.UnitMaxMana);
                    AppendStat(ref sb, "HU", msg.UnitHunger,  msg.UnitMaxHunger);
                    AppendStat(ref sb, "FT", msg.UnitFatigue, msg.UnitMaxFatigue);
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
            _controlActivitySub?.Dispose();
            _controlActivitySub = null;
            _disposables?.Dispose();
        }
    }
}
