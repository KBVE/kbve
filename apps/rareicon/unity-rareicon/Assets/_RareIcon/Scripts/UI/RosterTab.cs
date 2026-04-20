using System;
using System.Collections.Generic;
using Cysharp.Text;
using MessagePipe;
using R3;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.UIElements;

namespace RareIcon
{
    /// <summary>Citizens "Roster" tab — scrollable list with badge + name + activity + HP, plus a detail card with full stat bars and Jump/Possess actions.</summary>
    public class RosterTab : ICitizensTab
    {
        const int RefreshIntervalMs = 500;

        // Same job set as JobsTab; both UIs edit the same JobPriorities
        // component, JobsTab in bulk-by-type, this tab per-individual.
        static readonly (byte Kind, string Label)[] Jobs = new (byte, string)[]
        {
            (JobKind.Looter,     "Looter"),
            (JobKind.Lumberjack, "Lumberjack"),
            (JobKind.Miner,      "Miner"),
            (JobKind.Guard,      "Guard"),
            (JobKind.Farmer,     "Farmer"),
            (JobKind.Builder,    "Builder"),
            (JobKind.Chef,       "Chef"),
            (JobKind.Blacksmith, "Blacksmith"),
        };

        readonly LocaleService _locale;
        readonly ActivityFeedService _activity;
        readonly CameraService _camera;
        readonly IPublisher<PossessUnitMessage> _possessPub;

        readonly List<RosterEntry> _entries = new();
        readonly Dictionary<Entity, RosterEntry> _entryByEntity = new();

        VisualElement _root;
        ScrollView _list;
        ScrollView _detail;
        Label _detailTitle;
        Label _detailActivity;
        VisualElement _detailStats;
        VisualElement _jobsSection;
        UIControls.StepperHandle[] _jobSteppers;
        StatBar _detailHp, _detailEn, _detailHu, _detailFt;
        Button _jumpBtn, _possessBtn;
        IVisualElementScheduledItem _refreshTick;
        IDisposable _activitySub;
        Entity _selected;

        public string Title => "Roster";

        public RosterTab(LocaleService locale,
                         ActivityFeedService activity,
                         CameraService camera,
                         IPublisher<PossessUnitMessage> possessPub)
        {
            _locale = locale;
            _activity = activity;
            _camera = camera;
            _possessPub = possessPub;
        }

        public VisualElement Build()
        {
            _root = new VisualElement();
            _root.style.flexDirection = FlexDirection.Row;

            BuildList(_root);
            BuildDetail(_root);
            return _root;
        }

        void BuildList(VisualElement parent)
        {
            var col = new VisualElement();
            col.AddToClassList("roster-list");

            var header = new Label("Citizens");
            header.AddToClassList("roster-list__title");
            col.Add(header);

            _list = new ScrollView(ScrollViewMode.Vertical);
            _list.AddToClassList("roster-scroll");
            col.Add(_list);

            parent.Add(col);
        }

        void BuildDetail(VisualElement parent)
        {
            _detail = new ScrollView(ScrollViewMode.Vertical);
            _detail.AddToClassList("roster-detail");

            _detailTitle = new Label("Select a citizen");
            _detailTitle.AddToClassList("roster-detail__title");
            _detail.Add(_detailTitle);

            _detailActivity = new Label(string.Empty);
            _detailActivity.AddToClassList("roster-detail__activity");
            _detail.Add(_detailActivity);

            _detailStats = new VisualElement();
            _detailStats.AddToClassList("roster-detail__stats");
            _detailHp = new StatBar("HP", "hp", _detailStats);
            _detailEn = new StatBar("EN", "en", _detailStats);
            _detailHu = new StatBar("HU", "hu", _detailStats);
            _detailFt = new StatBar("FT", "ft", _detailStats);
            _detail.Add(_detailStats);

            BuildJobs(_detail);

            var actions = new VisualElement();
            actions.AddToClassList("roster-detail__actions");
            _jumpBtn = MakeAction(_locale.Get("ui.jump_to"), JumpToSelected);
            _possessBtn = MakeAction(_locale.Get("ui.possess"), PossessSelected);
            actions.Add(_jumpBtn);
            actions.Add(_possessBtn);
            _detail.Add(actions);

            parent.Add(_detail);
        }

        // Per-unit job priority editor — 8 stepper rows wired to the
        // selected entity's JobPriorities component. Hidden until a unit
        // is selected. Steppers fire onChange ONLY for user clicks (the
        // SetValue path on RefreshDetail bypasses onChange).
        void BuildJobs(VisualElement parent)
        {
            _jobsSection = new VisualElement();
            _jobsSection.AddToClassList("roster-detail__jobs");

            var header = new Label("Job Priorities");
            header.AddToClassList("cz-section");
            _jobsSection.Add(header);

            _jobSteppers = new UIControls.StepperHandle[Jobs.Length];
            for (int i = 0; i < Jobs.Length; i++)
            {
                int captured = i;
                _jobSteppers[i] = UIControls.MakeStepperRow(
                    Jobs[i].Label, initial: 0, min: 0, max: 5,
                    onChange: v => SetJobForSelected(Jobs[captured].Kind, (byte)v));
                _jobsSection.Add(_jobSteppers[i].Row);
            }

            _jobsSection.style.display = DisplayStyle.None;
            parent.Add(_jobsSection);
        }

        static Button MakeAction(string text, Action onClick)
        {
            var b = new Button(() => onClick?.Invoke()) { text = text };
            b.AddToClassList("btn");
            b.AddToClassList("btn--sm");
            b.SetEnabled(false);
            return b;
        }

        public void OnActivated()
        {
            RebuildList();
            _refreshTick = _root.schedule.Execute(RebuildList).Every(RefreshIntervalMs);
        }

        /// <summary>Drive selection from outside the tab — used by the click-router when the player right-clicks / clicks a goblin out in the world and we want the Roster panel to open with that unit already chosen. Rebuilds the list first so freshly-spawned entities can be picked.</summary>
        public void ShowUnit(Entity entity)
        {
            if (entity == Entity.Null) return;
            RebuildList();
            if (_entryByEntity.ContainsKey(entity)) Select(entity);
        }

        public void Dispose()
        {
            _refreshTick?.Pause();
            _refreshTick = null;
            _activitySub?.Dispose();
            _activitySub = null;
        }

        void RebuildList()
        {
            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;

            using var query = em.CreateEntityQuery(
                ComponentType.ReadOnly<Unit>(),
                ComponentType.ReadOnly<Faction>());
            using var entities = query.ToEntityArray(Allocator.Temp);

            for (int i = 0; i < _entries.Count; i++) _entries[i].Live = false;

            for (int i = 0; i < entities.Length; i++)
            {
                var e = entities[i];
                var faction = em.GetComponentData<Faction>(e);
                if (faction.Value != FactionType.Player) continue;

                if (!_entryByEntity.TryGetValue(e, out var entry))
                {
                    entry = CreateRow(e, em);
                    _entryByEntity[e] = entry;
                    _entries.Add(entry);
                    _list.Add(entry.Element);
                }
                entry.Live = true;
                RefreshRow(entry, em);
            }

            for (int i = _entries.Count - 1; i >= 0; i--)
            {
                if (_entries[i].Live) continue;
                _list.Remove(_entries[i].Element);
                _entryByEntity.Remove(_entries[i].Entity);
                if (_entries[i].Entity == _selected) ClearSelection();
                _entries.RemoveAt(i);
            }

            if (_selected != Entity.Null && _entryByEntity.ContainsKey(_selected))
                RefreshDetail(em, _selected);
        }

        RosterEntry CreateRow(Entity entity, EntityManager em)
        {
            var row = new VisualElement();
            row.AddToClassList("roster-row");

            var unitType = em.HasComponent<Unit>(entity)
                ? em.GetComponentData<Unit>(entity).Type
                : UnitType.None;

            var badge = new Label(BadgeLetter(unitType));
            badge.AddToClassList("roster-row__badge");
            badge.AddToClassList(BadgeVariant(unitType));
            row.Add(badge);

            var main = new VisualElement();
            main.AddToClassList("roster-row__main");
            var name = new Label(string.Empty);
            name.AddToClassList("roster-row__name");
            var activity = new Label(string.Empty);
            activity.AddToClassList("roster-row__activity");
            main.Add(name);
            main.Add(activity);
            row.Add(main);

            var bar = new StatBar(null, "hp", row, classOverride: "roster-row__bar");

            var entry = new RosterEntry
            {
                Entity = entity,
                Element = row,
                NameLabel = name,
                ActivityLabel = activity,
                HpBar = bar,
                Live = true,
            };
            row.RegisterCallback<ClickEvent>(_ => Select(entry.Entity));
            return entry;
        }

        void RefreshRow(RosterEntry entry, EntityManager em)
        {
            var unit = em.GetComponentData<Unit>(entry.Entity);
            entry.NameLabel.text = ResolveLabel(em, entry.Entity, unit.Type);

            var snap = _activity.CurrentFor(entry.Entity);
            string actLabel = _locale.GetActivityName(snap.Kind);
            entry.ActivityLabel.text = actLabel.Length > 0 ? actLabel : _locale.Get("activity.idle");

            if (em.HasComponent<Health>(entry.Entity))
            {
                var h = em.GetComponentData<Health>(entry.Entity);
                entry.HpBar.SetValue(h.Value, h.Max);
            }
            else entry.HpBar.SetValue(0, 0);

            entry.Element.EnableInClassList("is-selected", entry.Entity == _selected);
        }

        void Select(Entity entity)
        {
            _selected = entity;
            for (int i = 0; i < _entries.Count; i++)
                _entries[i].Element.EnableInClassList("is-selected", _entries[i].Entity == entity);

            _activitySub?.Dispose();
            _activitySub = _activity.For(entity).Subscribe(snapshot =>
            {
                if (_selected != entity) return;
                string label = _locale.GetActivityName(snapshot.Kind);
                _detailActivity.text = label.Length > 0 ? label : _locale.Get("activity.idle");
            });

            _jumpBtn.SetEnabled(true);
            _possessBtn.SetEnabled(true);

            var world = World.DefaultGameObjectInjectionWorld;
            if (world != null && world.IsCreated) RefreshDetail(world.EntityManager, entity);
        }

        void ClearSelection()
        {
            _selected = Entity.Null;
            _activitySub?.Dispose();
            _activitySub = null;
            _detailTitle.text = "Select a citizen";
            _detailActivity.text = string.Empty;
            _detailHp.Clear(); _detailEn.Clear(); _detailHu.Clear(); _detailFt.Clear();
            _jobsSection.style.display = DisplayStyle.None;
            _jumpBtn.SetEnabled(false);
            _possessBtn.SetEnabled(false);
        }

        // User-driven stepper change → write priority back to the
        // selected entity's JobPriorities. JobsTab's bulk Apply later
        // would clobber this; that's the documented bulk-vs-override
        // model (per-type defaults + per-individual overrides).
        void SetJobForSelected(byte jobKind, byte priority)
        {
            if (_selected == Entity.Null) return;
            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;
            if (!em.Exists(_selected) || !em.HasComponent<JobPriorities>(_selected)) return;
            var jp = em.GetComponentData<JobPriorities>(_selected);
            jp.Set(jobKind, priority);
            em.SetComponentData(_selected, jp);
        }

        void RefreshDetail(EntityManager em, Entity entity)
        {
            if (!em.Exists(entity)) { ClearSelection(); return; }

            var unit = em.GetComponentData<Unit>(entity);
            _detailTitle.text = ResolveLabel(em, entity, unit.Type);

            UpdateBar(em, entity, _detailHp, has: em.HasComponent<Health>(entity),
                value: em.HasComponent<Health>(entity)  ? em.GetComponentData<Health>(entity).Value  : 0f,
                max:   em.HasComponent<Health>(entity)  ? em.GetComponentData<Health>(entity).Max    : 0f);
            UpdateBar(em, entity, _detailEn, has: em.HasComponent<Energy>(entity),
                value: em.HasComponent<Energy>(entity)  ? em.GetComponentData<Energy>(entity).Value  : 0f,
                max:   em.HasComponent<Energy>(entity)  ? em.GetComponentData<Energy>(entity).Max    : 0f);
            UpdateBar(em, entity, _detailHu, has: em.HasComponent<Hunger>(entity),
                value: em.HasComponent<Hunger>(entity)  ? em.GetComponentData<Hunger>(entity).Value  : 0f,
                max:   em.HasComponent<Hunger>(entity)  ? em.GetComponentData<Hunger>(entity).Max    : 0f);
            if (em.HasComponent<JobPriorities>(entity))
            {
                var jp = em.GetComponentData<JobPriorities>(entity);
                for (int i = 0; i < Jobs.Length; i++)
                    _jobSteppers[i].SetValue(jp.Get(Jobs[i].Kind));
                _jobsSection.style.display = DisplayStyle.Flex;
            }
            else _jobsSection.style.display = DisplayStyle.None;

            UpdateBar(em, entity, _detailFt, has: em.HasComponent<Fatigue>(entity),
                value: em.HasComponent<Fatigue>(entity) ? em.GetComponentData<Fatigue>(entity).Value : 0f,
                max:   em.HasComponent<Fatigue>(entity) ? em.GetComponentData<Fatigue>(entity).Max   : 0f);

            var snapshot = _activity.CurrentFor(entity);
            string activityLabel = _locale.GetActivityName(snapshot.Kind);
            _detailActivity.text = activityLabel.Length > 0 ? activityLabel : _locale.Get("activity.idle");
        }

        static void UpdateBar(EntityManager em, Entity e, StatBar bar, bool has, float value, float max)
        {
            if (!has || max <= 0f) bar.Clear();
            else bar.SetValue(value, max);
        }

        string ResolveLabel(EntityManager em, Entity entity, byte unitType)
        {
            if (em.HasComponent<UnitName>(entity))
            {
                var nm = em.GetComponentData<UnitName>(entity);
                string named = _locale.GetGoblinName(nm.FirstNameId, nm.EpithetId);
                if (named.Length > 0) return named;
            }
            return _locale.GetCreatureName(unitType);
        }

        void JumpToSelected()
        {
            if (_selected == Entity.Null) return;
            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;
            if (!em.Exists(_selected)) return;
            if (!em.HasComponent<LocalTransform>(_selected)) return;
            var t = em.GetComponentData<LocalTransform>(_selected);
            _camera.JumpTo(new float2(t.Position.x, t.Position.y));
        }

        void PossessSelected()
        {
            if (_selected == Entity.Null) return;
            _possessPub.Publish(new PossessUnitMessage(_selected));
        }

        static string BadgeLetter(byte type) => type switch
        {
            UnitType.Goblin  => "G",
            UnitType.Soldier => "S",
            UnitType.Knight  => "K",
            UnitType.Mage    => "M",
            UnitType.King    => "♕",
            _                => "U",
        };

        static string BadgeVariant(byte type) => type switch
        {
            UnitType.Goblin  => "roster-row__badge--goblin",
            UnitType.Soldier => "roster-row__badge--soldier",
            UnitType.Knight  => "roster-row__badge--knight",
            UnitType.Mage    => "roster-row__badge--mage",
            UnitType.King    => "roster-row__badge--king",
            _                => "roster-row__badge--goblin",
        };

        sealed class RosterEntry
        {
            public Entity Entity;
            public VisualElement Element;
            public Label NameLabel;
            public Label ActivityLabel;
            public StatBar HpBar;
            public bool Live;
        }

        // Mini bar control: optional label · filled bar · "n/m" value.
        // When `classOverride` is set the wrapper takes that single class
        // and skips the label/value (used for the inline row HP bar).
        sealed class StatBar
        {
            public readonly VisualElement Root;
            readonly VisualElement _fill;
            readonly Label _value;

            public StatBar(string label, string colorKind, VisualElement parent, string classOverride = null)
            {
                if (classOverride != null)
                {
                    Root = new VisualElement();
                    Root.AddToClassList(classOverride);
                    var bar = new VisualElement();
                    bar.AddToClassList("bar");
                    _fill = new VisualElement();
                    _fill.AddToClassList("bar__fill");
                    _fill.AddToClassList("bar__fill--" + colorKind);
                    bar.Add(_fill);
                    Root.Add(bar);
                    parent.Add(Root);
                    return;
                }

                Root = new VisualElement();
                Root.AddToClassList("stat-row");

                if (!string.IsNullOrEmpty(label))
                {
                    var l = new Label(label);
                    l.AddToClassList("stat-row__label");
                    Root.Add(l);
                }

                var bar2 = new VisualElement();
                bar2.AddToClassList("stat-row__bar");
                bar2.AddToClassList("bar");
                _fill = new VisualElement();
                _fill.AddToClassList("bar__fill");
                _fill.AddToClassList("bar__fill--" + colorKind);
                bar2.Add(_fill);
                Root.Add(bar2);

                _value = new Label(string.Empty);
                _value.AddToClassList("stat-row__value");
                Root.Add(_value);

                parent.Add(Root);
            }

            public void SetValue(float v, float max)
            {
                float pct = max <= 0f ? 0f : math.saturate(v / max);
                _fill.style.width = Length.Percent(pct * 100f);
                if (_value != null)
                    _value.text = ZString.Format("{0}/{1}", (int)Mathf.Round(v), (int)Mathf.Round(max));
            }

            public void Clear()
            {
                _fill.style.width = Length.Percent(0f);
                if (_value != null) _value.text = string.Empty;
            }
        }
    }
}
