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
    public class UIBuildingInspector : IAsyncStartable, ITickable, IDisposable
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
        Button _releaseBtn, _demolishBtn, _upgradeBtn, _recruitScoutBtn, _recruitGoblinBtn, _recruitCavalryBtn;
        Label _heroTimerLabel;
        VisualElement _upgradePanel;
        Label _upgradePanelHeader;
        VisualElement _upgradePanelCards;
        Button _upgradePanelClose;
        BuildingPanelTabs _tabs;
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
            _upgradeBtn      = _root.Q<Button>("inspector-upgrade");

            _titleLabel.text = _locale.Get("inspector.title");
            _releaseBtn.text = _locale.Get("inspector.release_king");
            _releaseBtn.clicked += RequestRelease;
            if (_demolishBtn != null)
            {
                _demolishBtn.text = _locale.Get("inspector.demolish");
                _demolishBtn.clicked += RequestDemolish;
            }
            if (_upgradeBtn != null)
            {
                _upgradeBtn.text = _locale.Get("inspector.upgrade");
                _upgradeBtn.clicked += OpenUpgradePanel;
            }
            EnsureRecruitScoutButton();
            EnsureUpgradePanel();
            BuildTabs();
            _root.Q<Button>("inspector-close").clicked += Close;

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

        public void Close()
        {
            _isOpen.Value = false;
            ClearAuraHighlight();
        }

        void OnInspect(BuildingInspectMessage msg)
        {
            if (msg.Building == Entity.Null) return;
            _target = msg.Building;
            _isOpen.Value = true;
            Refresh();
        }

        void EnsureRecruitScoutButton()
        {
            _recruitScoutBtn = _root.Q<Button>("inspector-recruit-scout");
            if (_recruitScoutBtn == null && _demolishBtn != null)
            {
                _recruitScoutBtn = new Button { name = "inspector-recruit-scout" };
                _recruitScoutBtn.AddToClassList(_demolishBtn.GetClasses() != null ? "inspector-action" : "");
                foreach (var cls in _demolishBtn.GetClasses())
                    _recruitScoutBtn.AddToClassList(cls);
                var parent = _demolishBtn.parent;
                if (parent != null)
                    parent.Insert(parent.IndexOf(_demolishBtn), _recruitScoutBtn);
            }
            if (_recruitScoutBtn == null) return;
            _recruitScoutBtn.text = _locale.Get("inspector.recruit_scout");
            _recruitScoutBtn.clicked += RequestRecruitScout;
            SetHidden(_recruitScoutBtn, true);
        }

        void BuildTabs()
        {
            if (_panel == null) return;
            _tabs = new BuildingPanelTabs();

            var scrollView = _root.Q<ScrollView>("inspector-scroll");
            var infoContent = new VisualElement { name = "tab-info-content" };
            infoContent.style.flexGrow = 1f;
            if (scrollView != null)
            {
                scrollView.parent?.Remove(scrollView);
                scrollView.style.flexGrow = 1f;
                infoContent.Add(scrollView);
            }
            _tabs.AddTab("info", _locale.Get("inspector.tab_info"), infoContent);

            var upgradesContent = new VisualElement { name = "tab-upgrades-content" };
            if (_upgradePanelCards != null)
            {
                _upgradePanelCards.parent?.Remove(_upgradePanelCards);
                upgradesContent.Add(_upgradePanelCards);
            }
            _tabs.AddTab("upgrades", _locale.Get("inspector.tab_upgrades"), upgradesContent);

            var recruitContent = new VisualElement { name = "tab-recruit-content" };
            if (_recruitScoutBtn != null)
            {
                _recruitScoutBtn.parent?.Remove(_recruitScoutBtn);
                _recruitScoutBtn.style.marginBottom = 4;
                _recruitScoutBtn.RemoveFromClassList("is-hidden");
                _recruitScoutBtn.style.display = DisplayStyle.Flex;
                recruitContent.Add(_recruitScoutBtn);
            }
            _recruitGoblinBtn = new Button(RequestRecruitGoblin) { name = "inspector-recruit-goblin" };
            _recruitGoblinBtn.text = _locale.Get("inspector.hire_goblin");
            _recruitGoblinBtn.style.marginBottom = 4;
            recruitContent.Add(_recruitGoblinBtn);
            _recruitCavalryBtn = new Button(RequestRecruitCavalry) { name = "inspector-recruit-cavalry" };
            _recruitCavalryBtn.text = _locale.Get("inspector.recruit_cavalry");
            _recruitCavalryBtn.style.marginBottom = 4;
            recruitContent.Add(_recruitCavalryBtn);
            _heroTimerLabel = new Label(string.Empty) { name = "inspector-hero-timer" };
            _heroTimerLabel.style.marginTop = 4;
            _heroTimerLabel.style.fontSize = 11;
            _heroTimerLabel.style.opacity = 0.85f;
            recruitContent.Add(_heroTimerLabel);
            _tabs.AddTab("recruit", _locale.Get("inspector.tab_recruit"), recruitContent);

            int beforeIdx = _releaseBtn != null
                ? _panel.IndexOf(_releaseBtn)
                : _panel.childCount;
            if (beforeIdx < 0) beforeIdx = _panel.childCount;
            _panel.Insert(beforeIdx, _tabs.Root);

            if (_upgradeBtn != null) SetHidden(_upgradeBtn, true);
            if (_upgradePanel != null) SetHidden(_upgradePanel, true);

            _tabs.SetTabVisible("upgrades", false);
            _tabs.SetTabVisible("recruit", false);
        }

        void EnsureUpgradePanel()
        {
            _upgradePanel = _root.Q<VisualElement>("inspector-upgrade-panel");
            if (_upgradePanel == null)
            {
                _upgradePanel = new VisualElement { name = "inspector-upgrade-panel" };
                _upgradePanel.style.flexDirection = FlexDirection.Column;
                _upgradePanel.style.marginTop = 6;
                _upgradePanel.style.paddingTop = 6;
                _upgradePanel.style.paddingBottom = 6;
                _upgradePanel.style.paddingLeft = 6;
                _upgradePanel.style.paddingRight = 6;
                _upgradePanel.style.backgroundColor = new StyleColor(new UnityEngine.Color(0.08f, 0.10f, 0.14f, 0.92f));
                _upgradePanel.style.borderTopLeftRadius = 4;
                _upgradePanel.style.borderTopRightRadius = 4;
                _upgradePanel.style.borderBottomLeftRadius = 4;
                _upgradePanel.style.borderBottomRightRadius = 4;
                if (_panel != null) _panel.Add(_upgradePanel); else _root.Add(_upgradePanel);
            }
            _upgradePanel.Clear();
            _upgradePanelHeader = new Label(_locale.Get("inspector.upgrade_panel_header"))
            {
                name = "inspector-upgrade-panel-header",
            };
            _upgradePanelHeader.style.unityFontStyleAndWeight = UnityEngine.FontStyle.Bold;
            _upgradePanelHeader.style.fontSize      = 16;
            _upgradePanelHeader.style.color         = UIStyles.Palette.TextStrong;
            _upgradePanelHeader.style.letterSpacing = 2;
            _upgradePanelHeader.style.marginBottom  = 8;
            _upgradePanel.Add(_upgradePanelHeader);
            _upgradePanelCards = new VisualElement { name = "inspector-upgrade-panel-cards" };
            _upgradePanelCards.style.flexDirection = FlexDirection.Column;
            _upgradePanel.Add(_upgradePanelCards);
            _upgradePanelClose = new Button(CloseUpgradePanel) { name = "inspector-upgrade-panel-close" };
            _upgradePanelClose.text = _locale.Get("inspector.upgrade_panel_close");
            _upgradePanelClose.style.marginTop = 4;
            _upgradePanel.Add(_upgradePanelClose);
            SetHidden(_upgradePanel, true);
        }

        void OpenUpgradePanel()
        {
            if (_tabs == null) return;
            _tabs.TryActivate("upgrades");
        }

        void CloseUpgradePanel()
        {
            if (_upgradePanel != null) SetHidden(_upgradePanel, true);
        }

        void PopulateUpgradeCards(EntityManager em, byte type, byte tier)
        {
            if (_upgradePanelCards == null) return;
            if (!BuildingDB.HasUpgrade(type, tier)) { _upgradePanelCards.Clear(); return; }

            _upgradePanelCards.Clear();
            var variants = BuildingDB.GetUpgradeVariants(type, tier);
            for (int i = 0; i < variants.Length; i++)
                _upgradePanelCards.Add(BuildUpgradeCard(type, tier, variants[i]));
        }

        VisualElement BuildUpgradeCard(byte type, byte fromTier, byte variant)
        {
            var card = new VisualElement();
            card.style.flexDirection = FlexDirection.Column;
            card.style.marginBottom  = 8;
            card.style.paddingTop    = 10;
            card.style.paddingBottom = 10;
            card.style.paddingLeft   = 12;
            card.style.paddingRight  = 12;
            card.style.backgroundColor = UIStyles.Palette.TileHudBg;
            card.style.borderTopLeftRadius     = 6;
            card.style.borderTopRightRadius    = 6;
            card.style.borderBottomLeftRadius  = 6;
            card.style.borderBottomRightRadius = 6;
            card.style.borderTopWidth    = 1;
            card.style.borderBottomWidth = 1;
            card.style.borderLeftWidth   = 1;
            card.style.borderRightWidth  = 1;
            card.style.borderTopColor    = UIStyles.Palette.BorderGold;
            card.style.borderBottomColor = UIStyles.Palette.BorderGold;
            card.style.borderLeftColor   = UIStyles.Palette.BorderGold;
            card.style.borderRightColor  = UIStyles.Palette.BorderGold;

            string nameKey = ResolveVariantNameKey(type, fromTier, variant);
            string descKey = ResolveVariantDescKey(type, fromTier, variant);

            var title = new Label(_locale.Get(nameKey));
            title.style.unityFontStyleAndWeight = UnityEngine.FontStyle.Bold;
            title.style.fontSize     = 15;
            title.style.color        = UIStyles.Palette.TextStrong;
            title.style.letterSpacing = 1;
            title.style.marginBottom = 4;
            card.Add(title);

            string desc = _locale.Get(descKey);
            if (!string.IsNullOrEmpty(desc))
            {
                var descLabel = new Label(desc);
                descLabel.style.fontSize    = 12;
                descLabel.style.color       = UIStyles.Palette.TextPrimary;
                descLabel.style.whiteSpace  = WhiteSpace.Normal;
                descLabel.style.marginBottom = 6;
                card.Add(descLabel);
            }

            var costSb = ZString.CreateStringBuilder();
            try
            {
                var cost = BuildingDB.GetUpgradeCost(type, fromTier, variant);
                for (int i = 0; i < cost.Length; i++)
                {
                    if (i > 0) costSb.Append("   ");
                    costSb.Append(cost[i].Amount);
                    costSb.Append(' ');
                    costSb.Append(_locale.GetItemName(cost[i].ItemId));
                }
                var costLabel = new Label(costSb.ToString());
                costLabel.style.fontSize     = 12;
                costLabel.style.color        = UIStyles.Palette.TextResource;
                costLabel.style.unityFontStyleAndWeight = UnityEngine.FontStyle.Bold;
                costLabel.style.marginBottom = 6;
                card.Add(costLabel);
            }
            finally { costSb.Dispose(); }

            var commit = UIStyles.MakeButton(_locale.Get("inspector.upgrade_panel_commit"), () => CommitUpgrade(variant));
            commit.style.marginTop = 4;
            commit.style.height    = 30;
            commit.style.fontSize  = 13;
            commit.style.unityFontStyleAndWeight = UnityEngine.FontStyle.Bold;
            commit.style.backgroundColor = UIStyles.Palette.GoldDeep;
            commit.style.color           = UIStyles.Palette.Zinc950;
            card.Add(commit);

            return card;
        }

        static string ResolveVariantNameKey(byte type, byte fromTier, byte variant)
        {
            byte targetTier = (byte)(fromTier + 1);
            if (type == BuildingType.Tower && fromTier == 0)
            {
                if (variant == 1) return "building.beacon_tower";
                if (variant == 2) return "building.highwatch_tower";
                return "building.watch_tower";
            }
            if (type == BuildingType.Inn && fromTier == 0)
            {
                if (variant == 1) return "building.ale_house";
                return "building.tavern";
            }
            if (type == BuildingType.Furnace && fromTier == 0)
            {
                if (variant == 1) return "building.glassworks";
                return "building.forge";
            }
            if (type == BuildingType.Outpost && fromTier == 0)
            {
                if (variant == 1) return "building.beacon_outpost";
                if (variant == 2) return "building.gatepost";
                return "building.watchpost";
            }
            if (type == BuildingType.Barracks && fromTier == 0)
            {
                if (variant == 1) return "building.stables";
                if (variant == 2) return "building.guildhall";
                return "building.keep";
            }
            if (type == BuildingType.Wall && fromTier == 0)
            {
                if (variant == 1) return "building.buttress";
                if (variant == 2) return "building.palisade";
                return "building.reinforced_wall";
            }
            return BuildingDB.GetTieredLocaleKey(type, targetTier);
        }

        static string ResolveVariantDescKey(byte type, byte fromTier, byte variant)
        {
            if (type == BuildingType.Tower && fromTier == 0)
            {
                if (variant == 1) return "inspector.tower_variant.beacon_desc";
                if (variant == 2) return "inspector.tower_variant.highwatch_desc";
                return "inspector.tower_variant.watch_desc";
            }
            if (type == BuildingType.Inn && fromTier == 0)
            {
                if (variant == 1) return "inspector.inn_variant.ale_house_desc";
                return "inspector.inn_variant.tavern_desc";
            }
            if (type == BuildingType.Furnace && fromTier == 0)
            {
                if (variant == 1) return "inspector.furnace_variant.glassworks_desc";
                return "inspector.furnace_variant.forge_desc";
            }
            if (type == BuildingType.Outpost && fromTier == 0)
            {
                if (variant == 1) return "inspector.outpost_variant.beacon_desc";
                if (variant == 2) return "inspector.outpost_variant.gatepost_desc";
                return "inspector.outpost_variant.watchpost_desc";
            }
            if (type == BuildingType.Barracks && fromTier == 0)
            {
                if (variant == 1) return "inspector.barracks_variant.stables_desc";
                if (variant == 2) return "inspector.barracks_variant.guildhall_desc";
                return "inspector.barracks_variant.keep_desc";
            }
            if (type == BuildingType.Wall && fromTier == 0)
            {
                if (variant == 1) return "inspector.wall_variant.buttress_desc";
                if (variant == 2) return "inspector.wall_variant.palisade_desc";
                return "inspector.wall_variant.reinforced_desc";
            }
            return string.Empty;
        }

        void CommitUpgrade(byte variant)
        {
            CloseUpgradePanel();
            if (_target == Entity.Null) return;
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;
            if (!em.HasComponent<Building>(_target)) return;
            if (!em.HasComponent<BuildingTier>(_target)) return;
            byte type = em.GetComponentData<Building>(_target).Type;
            byte tier = em.GetComponentData<BuildingTier>(_target).Value;
            if (!BuildingDB.HasUpgrade(type, tier)) return;
            var req = em.CreateEntity();
            em.AddComponentData(req, new BuildingUpgradeRequest { Target = _target, VariantId = variant });
        }

        void RequestRecruitScout()
        {
            if (_target == Entity.Null) return;
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;
            if (!em.HasComponent<BarracksTag>(_target)) return;
            var req = em.CreateEntity();
            em.AddComponentData(req, new ScoutRecruitRequest { Barracks = _target });
        }

        void RequestRecruitGoblin()
        {
            if (_target == Entity.Null) return;
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;
            if (!em.HasComponent<GoblinCaveTag>(_target)) return;
            var req = em.CreateEntity();
            em.AddComponentData(req, new GoblinHireRequest { Cave = _target });
        }

        void RequestRecruitCavalry()
        {
            if (_target == Entity.Null) return;
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;
            if (!em.HasComponent<BarracksTag>(_target)
                || !em.HasComponent<BuildingTier>(_target)
                || !em.HasComponent<BuildingVariant>(_target)) return;
            byte tier    = em.GetComponentData<BuildingTier>(_target).Value;
            byte variant = em.GetComponentData<BuildingVariant>(_target).Value;
            if (tier != 1 || variant != 1) return;
            var req = em.CreateEntity();
            em.AddComponentData(req, new CavalryRecruitRequest { Barracks = _target });
        }

        void RequestRelease()
        {
            if (_target == Entity.Null) return;
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;
            var req = em.CreateEntity();
            em.AddComponentData(req, new ReleaseShelterRequest { Host = _target });
        }

        void RequestDemolish()
        {
            if (_target == Entity.Null) return;
            var world = GameplayWorld.Resolve();
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
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;

            if (!em.Exists(_target) || !em.HasComponent<Building>(_target))
            {
                _isOpen.Value = false;
                _target = Entity.Null;
                return;
            }

            var b = em.GetComponentData<Building>(_target);
            byte tier = em.HasComponent<BuildingTier>(_target)
                ? em.GetComponentData<BuildingTier>(_target).Value
                : (byte)0;

            string title = _locale.Get(BuildingDB.GetTieredLocaleKey(b.Type, tier));
            if (b.Type == BuildingType.Landmark && em.HasComponent<LandmarkRef>(_target))
            {
                var lr = em.GetSharedComponentManaged<LandmarkRef>(_target);
                var refSlug = lr.Value.ToString();
                if (!string.IsNullOrEmpty(refSlug)
                    && MapdbCache.TryGetByRef(refSlug, out var def)
                    && !string.IsNullOrEmpty(def.Name))
                {
                    title = def.Name;
                }
            }
            _titleLabel.text = title;
            bool hasUpgrade = BuildingDB.HasUpgrade(b.Type, tier)
                              && b.OwnerFaction == FactionType.Player;
            if (_upgradeBtn != null) SetHidden(_upgradeBtn, true);
            if (_upgradePanel != null) SetHidden(_upgradePanel, true);

            bool ownsBuilding = b.OwnerFaction == FactionType.Player;
            bool hasBarracks  = ownsBuilding && em.HasComponent<BarracksTag>(_target);
            bool hasCave      = ownsBuilding && em.HasComponent<GoblinCaveTag>(_target);
            bool isStables    = hasBarracks
                                 && em.HasComponent<BuildingTier>(_target)
                                 && em.HasComponent<BuildingVariant>(_target)
                                 && em.GetComponentData<BuildingTier>(_target).Value == 1
                                 && em.GetComponentData<BuildingVariant>(_target).Value == 1;
            bool hasRecruit   = hasBarracks || hasCave;

            if (_recruitScoutBtn != null)
                _recruitScoutBtn.style.display = hasBarracks ? DisplayStyle.Flex : DisplayStyle.None;
            if (_recruitGoblinBtn != null)
                _recruitGoblinBtn.style.display = hasCave ? DisplayStyle.Flex : DisplayStyle.None;
            if (_recruitCavalryBtn != null)
                _recruitCavalryBtn.style.display = isStables ? DisplayStyle.Flex : DisplayStyle.None;
            bool hasHeroTicker = ownsBuilding && em.HasComponent<HeroRecruitTicker>(_target);
            if (_heroTimerLabel != null)
                _heroTimerLabel.style.display = hasHeroTicker ? DisplayStyle.Flex : DisplayStyle.None;

            if (em.HasComponent<BuildingSpeedAura>(_target) && ownsBuilding)
            {
                var aura = em.GetComponentData<BuildingSpeedAura>(_target);
                WriteAuraHighlight(em, b.RootHex, aura.Radius, true);
            }
            else
            {
                ClearAuraHighlight();
            }

            if (_tabs != null)
            {
                _tabs.SetTabVisible("upgrades", hasUpgrade);
                _tabs.SetTabVisible("recruit",  hasRecruit);
                if (hasUpgrade)
                    PopulateUpgradeCards(em, b.Type, tier);
                else if (_upgradePanelCards != null)
                    _upgradePanelCards.Clear();
            }

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

        void WriteAuraHighlight(EntityManager em, int2 center, byte radius, bool active)
        {
            using var q = em.CreateEntityQuery(ComponentType.ReadWrite<AuraHighlightTarget>());
            if (q.CalculateEntityCount() == 0) return;
            var tgt = q.GetSingleton<AuraHighlightTarget>();
            byte activeByte = (byte)(active && radius > 0 ? 1 : 0);
            bool changed = tgt.Active != activeByte
                           || tgt.Center.x != center.x || tgt.Center.y != center.y
                           || tgt.Radius != radius;
            if (!changed) return;
            tgt.Center     = center;
            tgt.Radius     = radius;
            tgt.Active     = activeByte;
            tgt.Generation = unchecked(tgt.Generation + 1u);
            q.SetSingleton(tgt);
        }

        void ClearAuraHighlight()
        {
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;
            using var q = em.CreateEntityQuery(ComponentType.ReadWrite<AuraHighlightTarget>());
            if (q.CalculateEntityCount() == 0) return;
            var tgt = q.GetSingleton<AuraHighlightTarget>();
            if (tgt.Active == 0) return;
            tgt.Active     = 0;
            tgt.Generation = unchecked(tgt.Generation + 1u);
            q.SetSingleton(tgt);
        }

        public void Tick()
        {
            if (_heroTimerLabel == null) return;
            if (!_isOpen.Value) return;
            if (_target == Entity.Null) return;
            if (_heroTimerLabel.style.display == DisplayStyle.None) return;

            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;
            if (!em.Exists(_target) || !em.HasComponent<HeroRecruitTicker>(_target)) return;

            var ticker = em.GetComponentData<HeroRecruitTicker>(_target);
            uint nowTick = (uint)(world.Time.ElapsedTime * 1000d);
            float remainingSec = ticker.NextRecruitTick > nowTick
                ? (ticker.NextRecruitTick - nowTick) * 0.001f
                : 0f;
            int rounded = (int)System.Math.Ceiling(remainingSec);

            var sb = ZString.CreateStringBuilder();
            try
            {
                sb.AppendFormat(_locale.Get("inspector.next_hero_in"), rounded);
                _heroTimerLabel.text = sb.ToString();
            }
            finally { sb.Dispose(); }
        }

        public void Dispose()
        {
            _disposables?.Dispose();
        }
    }
}
