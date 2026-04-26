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
    /// <summary>World-state HUD — toolbar, clock, controlling indicator, hover tile-info. Layout in Resources/UI/WorldHUD.uxml; this controller wires events + pushes data.</summary>
    public class WorldHUD : IAsyncStartable, IDisposable
    {
        readonly LocaleService _locale;
        readonly UIPanelManager _panelManager;
        readonly ScreenFrameHost _frame;
        readonly AppStateController _appState;
        readonly UISettings _settings;
        readonly UITreasury _treasury;
        readonly UICitizensPanel _citizensPanel;
        readonly UIMilitary _military;
        readonly UIBuildingPalette _buildingPalette;
        readonly BuildModeController _buildMode;
        readonly CameraService _camera;
        readonly ActivityFeedService _activity;
        readonly ISubscriber<HexHoverMessage> _hoverSub;
        readonly IPublisher<PossessUnitMessage> _possessPub;

        readonly CompositeDisposable _disposables = new();

        VisualElement _root;
        VisualElement _toolbar, _hoverPanel, _clockPanel, _controlPanel, _stack;
        Button _settingsBtn, _buildBtn, _kingBtn, _treasuryBtn, _militaryBtn, _citizensBtn, _releaseBtn;
        Label _clockTurn, _clockTime;
        VisualElement _clockIcon;
        Label _hoverName, _hoverCoord, _hoverCreature, _hoverStats, _hoverInv, _hoverRes;
        Label _controlLabel, _controlActivity;
        EntityQuery _clockQuery, _controlledQuery, _selectionQuery;
        bool _clockReady, _controlledReady, _selectionReady;
        Entity _lastControlled;
        byte _lastControlledType;
        IDisposable _controlActivitySub;

        int _lastSelectionCount = -1;
        int _lastGoblin, _lastSoldier, _lastKnight, _lastMage, _lastKing;

        const int IdleSkipEvery = 4;
        int _idleSkipCount;

        [Inject]
        public WorldHUD(
            LocaleService locale,
            UIPanelManager panelManager,
            ScreenFrameHost frame,
            AppStateController appState,
            UISettings settings,
            UITreasury treasury,
            UICitizensPanel citizensPanel,
            UIMilitary military,
            UIBuildingPalette buildingPalette,
            BuildModeController buildMode,
            CameraService camera,
            ActivityFeedService activity,
            ISubscriber<HexHoverMessage> hoverSub,
            IPublisher<PossessUnitMessage> possessPub)
        {
            _locale = locale;
            _panelManager = panelManager;
            _frame = frame;
            _appState = appState;
            _settings = settings;
            _treasury = treasury;
            _citizensPanel = citizensPanel;
            _military = military;
            _buildingPalette = buildingPalette;
            _buildMode = buildMode;
            _camera = camera;
            _activity = activity;
            _hoverSub = hoverSub;
            _possessPub = possessPub;
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

            await _frame.Ready;

            _root = UIPanelLoader.Load(uiDoc, "UI/WorldHUD");
            if (_root == null) return;

            BindElements();
            MountIntoFrame();

            // Toggle visibility on app state changes (Boot/InTile hide HUD).
            _appState.Current.Subscribe(state =>
            {
                var visible = state == AppInterfaceState.World;
                SetDisplay(_toolbar, visible);
                SetDisplay(_hoverPanel, visible);
                SetDisplay(_stack, visible);
            }).AddTo(_disposables);

            var bag = MessagePipe.DisposableBag.CreateBuilder();
            _hoverSub.Subscribe(OnHexHover).AddTo(bag);
            _disposables.Add(bag.Build());

            _clockPanel.schedule.Execute(RefreshClock).Every(250);
            _controlPanel.schedule.Execute(RefreshControlIndicator).Every(250);
            RefreshClock();
            RefreshControlIndicator();
        }

        void BindElements()
        {
            _toolbar       = _root.Q<VisualElement>("hud-toolbar");
            _stack         = _root.Q<VisualElement>("hud-stack");
            _clockPanel    = _root.Q<VisualElement>("hud-clock");
            _controlPanel  = _root.Q<VisualElement>("hud-control");
            _hoverPanel    = _root.Q<VisualElement>("hud-hover");

            _buildBtn    = _root.Q<Button>("hud-build");
            _kingBtn     = _root.Q<Button>("hud-king");
            _treasuryBtn = _root.Q<Button>("hud-treasury");
            _militaryBtn = _root.Q<Button>("hud-military");
            _citizensBtn = _root.Q<Button>("hud-citizens");
            _settingsBtn = _root.Q<Button>("hud-settings");
            _releaseBtn  = _root.Q<Button>("hud-release");

            _clockIcon = _root.Q<VisualElement>("hud-clock-icon");
            _clockTurn = _root.Q<Label>("hud-clock-turn");
            _clockTime = _root.Q<Label>("hud-clock-time");

            _hoverName     = _root.Q<Label>("hud-hover-name");
            _hoverCoord    = _root.Q<Label>("hud-hover-coord");
            _hoverCreature = _root.Q<Label>("hud-hover-creature");
            _hoverStats    = _root.Q<Label>("hud-hover-stats");
            _hoverInv      = _root.Q<Label>("hud-hover-inventory");
            _hoverRes      = _root.Q<Label>("hud-hover-resources");

            _controlLabel    = _root.Q<Label>("hud-control-label");
            _controlActivity = _root.Q<Label>("hud-control-activity");

            _buildBtn.clicked    += _buildingPalette.Toggle;
            _kingBtn.clicked     += JumpToKing;
            _treasuryBtn.clicked += _treasury.Toggle;
            _militaryBtn.clicked += _military.Toggle;
            _citizensBtn.clicked += _citizensPanel.Toggle;
            _settingsBtn.clicked += _settings.Toggle;
            _releaseBtn.clicked  += ReleaseControl;

            // Highlight Build button while build mode is active.
            _buildMode.Target.Subscribe(target =>
            {
                bool active = target != BuildTarget.None;
                if (active) _buildBtn.AddToClassList("is-active");
                else        _buildBtn.RemoveFromClassList("is-active");
            }).AddTo(_disposables);
        }

        static void SetDisplay(VisualElement el, bool visible)
        {
            if (el == null) return;
            el.style.display = visible ? DisplayStyle.Flex : DisplayStyle.None;
        }

        void MountIntoFrame()
        {
            if (_toolbar != null && _frame.TopLeft != null)
            {
                _toolbar.RemoveFromHierarchy();
                _toolbar.RemoveFromClassList("toolbar-pin");
                _toolbar.AddToClassList("toolbar-embed");
                _frame.TopLeft.Add(_toolbar);
            }
            if (_stack != null && _frame.TopRight != null)
            {
                _stack.RemoveFromHierarchy();
                _stack.RemoveFromClassList("hud-stack-tr");
                _stack.style.flexDirection = FlexDirection.Row;
                _frame.TopRight.Add(_stack);
            }
            if (_hoverPanel != null && _frame.BottomLeft != null)
            {
                _hoverPanel.RemoveFromHierarchy();
                _hoverPanel.RemoveFromClassList("tile-info");
                _hoverPanel.AddToClassList("tile-info--inline");
                _frame.BottomLeft.Add(_hoverPanel);
            }
        }

        // --- Clock ------------------------------------------------------------

        void RefreshClock()
        {
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;
            if (!_clockReady)
            {
                _clockQuery = em.CreateEntityQuery(ComponentType.ReadOnly<WorldClock>());
                _clockReady = true;
            }
            if (_clockQuery.CalculateEntityCount() == 0) return;
            var clock = _clockQuery.GetSingleton<WorldClock>();

            _clockTurn.text = ZString.Format("Turn {0} · {1}", clock.TurnIndex, clock.IsDay ? "Day" : "Night");
            int totalSec = (int)clock.TurnElapsed;
            _clockTime.text = ZString.Format("{0:00}:{1:00}", totalSec / 60, totalSec % 60);

            if (clock.IsDay)
            {
                _clockIcon.RemoveFromClassList("hud-strip__icon--night");
                _clockIcon.AddToClassList("hud-strip__icon--day");
            }
            else
            {
                _clockIcon.RemoveFromClassList("hud-strip__icon--day");
                _clockIcon.AddToClassList("hud-strip__icon--night");
            }
        }

        // --- Controlled-unit indicator ---------------------------------------

        void RefreshControlIndicator()
        {
            bool idle = _lastControlled == Entity.Null && _lastSelectionCount <= 0;
            if (idle)
            {
                _idleSkipCount++;
                if (_idleSkipCount < IdleSkipEvery) return;
            }
            _idleSkipCount = 0;

            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;
            if (!_controlledReady)
            {
                _controlledQuery = em.CreateEntityQuery(
                    ComponentType.ReadOnly<ControlledUnitTag>(),
                    ComponentType.ReadOnly<Unit>());
                _controlledReady = true;
            }

            Entity current = Entity.Null;
            byte type = UnitType.None;
            if (_controlledQuery.CalculateEntityCount() > 0)
            {
                using var arr = _controlledQuery.ToEntityArray(Allocator.Temp);
                current = arr[0];
                type = em.GetComponentData<Unit>(current).Type;
            }

            bool controlledChanged = (current != _lastControlled || type != _lastControlledType);
            _lastControlled = current;
            _lastControlledType = type;

            if (current == Entity.Null)
            {
                if (controlledChanged)
                {
                    _controlActivitySub?.Dispose();
                    _controlActivitySub = null;
                    _lastSelectionCount = -1;
                }
                RefreshSelectionIndicator(em);
                return;
            }

            if (!controlledChanged) return;
            _lastSelectionCount = -1;
            {
                string name = string.Empty;
                if (em.HasComponent<UnitName>(current))
                {
                    var nm = em.GetComponentData<UnitName>(current);
                    name = _locale.GetGoblinName(nm.FirstNameId, nm.EpithetId);
                }
                if (name.Length == 0) name = _locale.GetCreatureName(type);
                _controlLabel.text = ZString.Format(_locale.Get("hud.controlling"), name);
                _controlPanel.AddToClassList("hud-strip--strong");
                _releaseBtn.RemoveFromClassList("is-hidden");
                _controlActivity.RemoveFromClassList("is-hidden");

                _controlActivitySub?.Dispose();
                Entity captured = current;
                _controlActivitySub = _activity.For(current).Subscribe(snap =>
                {
                    if (_lastControlled != captured) return;
                    string act = _locale.GetActivityName(snap.Kind);
                    _controlActivity.text = act.Length > 0 ? act : _locale.Get("activity.idle");
                });
                var seed = _activity.CurrentFor(current);
                string seedAct = _locale.GetActivityName(seed.Kind);
                _controlActivity.text = seedAct.Length > 0 ? seedAct : _locale.Get("activity.idle");
            }
        }

        void RefreshSelectionIndicator(EntityManager em)
        {
            if (!_selectionReady)
            {
                _selectionQuery = em.CreateEntityQuery(
                    ComponentType.ReadOnly<SelectedTag>(),
                    ComponentType.ReadOnly<Unit>());
                _selectionReady = true;
            }

            int count = _selectionQuery.CalculateEntityCount();
            if (count == 0)
            {
                if (_lastSelectionCount == 0) return;
                _controlLabel.text = _locale.Get("hud.god_view");
                _controlPanel.RemoveFromClassList("hud-strip--strong");
                _releaseBtn.AddToClassList("is-hidden");
                _controlActivity.AddToClassList("is-hidden");
                _lastSelectionCount = 0;
                _lastGoblin = _lastSoldier = _lastKnight = _lastMage = _lastKing = 0;
                return;
            }

            int g = 0, s = 0, k = 0, m = 0, kg = 0;
            using (var arr = _selectionQuery.ToEntityArray(Allocator.Temp))
            {
                for (int i = 0; i < arr.Length; i++)
                {
                    byte t = em.GetComponentData<Unit>(arr[i]).Type;
                    switch (t)
                    {
                        case UnitType.Goblin:  g++;  break;
                        case UnitType.Soldier: s++;  break;
                        case UnitType.Knight:  k++;  break;
                        case UnitType.Mage:    m++;  break;
                        case UnitType.King:    kg++; break;
                    }
                }
            }

            if (count == _lastSelectionCount
                && g == _lastGoblin && s == _lastSoldier && k == _lastKnight
                && m == _lastMage && kg == _lastKing) return;
            _lastSelectionCount = count;
            _lastGoblin = g; _lastSoldier = s; _lastKnight = k;
            _lastMage = m; _lastKing = kg;

            _controlLabel.text = ZString.Format("{0} · {1} selected",
                _locale.Get("hud.god_view"), count);

            var sb = ZString.CreateStringBuilder();
            try
            {
                AppendTypeCount(ref sb, g,  "G");
                AppendTypeCount(ref sb, s,  "S");
                AppendTypeCount(ref sb, k,  "K");
                AppendTypeCount(ref sb, m,  "M");
                AppendTypeCount(ref sb, kg, "\u2655");
                _controlActivity.text = sb.ToString();
            }
            finally { sb.Dispose(); }

            _controlPanel.AddToClassList("hud-strip--strong");
            _releaseBtn.AddToClassList("is-hidden");
            _controlActivity.RemoveFromClassList("is-hidden");
        }

        static void AppendTypeCount(ref Cysharp.Text.Utf16ValueStringBuilder sb,
                                    int count, string letter)
        {
            if (count <= 0) return;
            if (sb.Length > 0) sb.Append(" · ");
            sb.Append(count); sb.Append(letter);
        }

        void ReleaseControl()
        {
            var world = GameplayWorld.Resolve();
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
            RefreshControlIndicator();
        }

        // --- Hover tile-info -------------------------------------------------

        void OnHexHover(HexHoverMessage msg)
        {
            if (_hoverName == null) return;

            _hoverName.text = msg.IsLand ? _locale.GetBiomeName(msg.BiomeId) : _locale.Get("hex.empty");
            _hoverCoord.text = ZString.Format("{0} ({1}, {2})", _locale.Get("hex.coord"), msg.Q, msg.R);

            if (msg.UnitType != UnitType.None)
            {
                _hoverCreature.RemoveFromClassList("is-hidden");

                string creatureName = _locale.GetCreatureName(msg.UnitType);
                string personal = msg.UnitNameFirstId != 0
                    ? _locale.GetGoblinName(msg.UnitNameFirstId, msg.UnitNameEpithetId)
                    : string.Empty;
                string factionLabel = _locale.GetFactionName(msg.UnitFaction);
                if (personal.Length > 0)
                    _hoverCreature.text = ZString.Format("{0} · {1} · {2}",
                        personal, creatureName, factionLabel);
                else
                    _hoverCreature.text = ZString.Format("{0} · {1}",
                        creatureName, factionLabel);

                _hoverCreature.RemoveFromClassList("tile-info__line--faction-player");
                _hoverCreature.RemoveFromClassList("tile-info__line--faction-hostile");
                _hoverCreature.RemoveFromClassList("tile-info__line--faction-beast");
                _hoverCreature.RemoveFromClassList("tile-info__line--faction-wildlife");
                _hoverCreature.RemoveFromClassList("tile-info__line--faction-neutral");
                _hoverCreature.AddToClassList(msg.UnitFaction switch
                {
                    FactionType.Player   => "tile-info__line--faction-player",
                    FactionType.Hostile  => "tile-info__line--faction-hostile",
                    FactionType.Beast    => "tile-info__line--faction-beast",
                    FactionType.Wildlife => "tile-info__line--faction-wildlife",
                    _                    => "tile-info__line--faction-neutral",
                });

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
                        _hoverStats.RemoveFromClassList("is-hidden");
                        _hoverStats.text = sb.ToString();
                    }
                    else _hoverStats.AddToClassList("is-hidden");
                }
                finally { sb.Dispose(); }
            }
            else
            {
                _hoverCreature.AddToClassList("is-hidden");
                _hoverStats.AddToClassList("is-hidden");
            }

            bool anyInv = (msg.UnitInvCount0 | msg.UnitInvCount1 | msg.UnitInvCount2 | msg.UnitInvCount3) != 0;
            if (msg.UnitType != UnitType.None && anyInv)
            {
                var sb = ZString.CreateStringBuilder();
                try
                {
                    AppendInv(ref sb, msg.UnitInvId0, msg.UnitInvCount0);
                    AppendInv(ref sb, msg.UnitInvId1, msg.UnitInvCount1);
                    AppendInv(ref sb, msg.UnitInvId2, msg.UnitInvCount2);
                    AppendInv(ref sb, msg.UnitInvId3, msg.UnitInvCount3);
                    _hoverInv.text = sb.ToString();
                }
                finally { sb.Dispose(); }
                _hoverInv.RemoveFromClassList("is-hidden");
            }
            else
            {
                _hoverInv.AddToClassList("is-hidden");
            }

            if (msg.IsLand && (msg.Wood | msg.Stone | msg.Berries | msg.Mushrooms | msg.Herbs | msg.Cactus) != 0)
            {
                var sb = ZString.CreateStringBuilder();
                try
                {
                    AppendRes(ref sb, msg.Wood,      ResourceType.Wood);
                    AppendRes(ref sb, msg.Stone,     ResourceType.Stone);
                    AppendRes(ref sb, msg.Berries,   ResourceType.Berries);
                    AppendRes(ref sb, msg.Mushrooms, ResourceType.Mushrooms);
                    AppendRes(ref sb, msg.Herbs,     ResourceType.Herbs);
                    AppendRes(ref sb, msg.Cactus,    ResourceType.Cactus, msg.CactusVariant);
                    _hoverRes.text = sb.ToString();
                }
                finally { sb.Dispose(); }
                _hoverRes.RemoveFromClassList("is-hidden");
            }
            else
            {
                _hoverRes.AddToClassList("is-hidden");
            }
        }

        void AppendRes(ref Utf16ValueStringBuilder sb, byte amount, byte type, byte variant = 0)
        {
            if (amount == 0) return;
            if (sb.Length > 0) sb.Append('\n');
            var label = (type == ResourceType.Cactus && variant != CactusVariantType.None)
                ? _locale.GetCactusLabel(variant)
                : _locale.GetResourceName(type);
            sb.Append(label); sb.Append(": "); sb.Append(amount);
        }

        void AppendInv(ref Utf16ValueStringBuilder sb, ushort itemId, ushort count)
        {
            if (itemId == 0 || count == 0) return;
            if (sb.Length > 0) sb.Append(", ");
            sb.Append(_locale.GetItemName(itemId)); sb.Append(" \u00D7 "); sb.Append(count);
        }

        static void AppendStat(ref Utf16ValueStringBuilder sb, string label, float value, float max)
        {
            if (max <= 0f) return;
            if (sb.Length > 0) sb.Append("  ");
            sb.Append(label); sb.Append(' ');
            sb.Append((int)Mathf.Round(value)); sb.Append('/'); sb.Append((int)Mathf.Round(max));
        }

        // --- Action: jump-to King -------------------------------------------

        void JumpToKing()
        {
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;
            using var query = em.CreateEntityQuery(
                ComponentType.ReadOnly<KingTag>(),
                ComponentType.ReadOnly<LocalTransform>());
            if (query.CalculateEntityCount() == 0) return;
            using var arr = query.ToEntityArray(Allocator.Temp);
            var king = arr[0];
            var t = em.GetComponentData<LocalTransform>(king);
            _camera.JumpTo(new float2(t.Position.x, t.Position.y));
            _possessPub?.Publish(new PossessUnitMessage(king));
        }

        public void Dispose()
        {
            _controlActivitySub?.Dispose();
            _controlActivitySub = null;
            _disposables?.Dispose();
        }
    }
}
