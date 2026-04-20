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
    /// <summary>
    /// Citizens-panel "Roster" tab — two-pane layout with a scrollable
    /// citizen list on the left and a detail card on the right showing
    /// the selected unit's name, current activity (resolved through the
    /// ActivityFeedService — Burst-side classifier feeds the value, no
    /// per-frame managed query), HP/Hunger/Fatigue/Energy bars, and
    /// quick action buttons (Jump To camera, Possess via the same
    /// PossessUnitMessage the click router emits).
    ///
    /// Refresh model: rows + bars poll every 500ms while the tab is
    /// open (HP/needs change continuously and don't have a reactive
    /// source today); the activity line is a true subscription to
    /// the per-entity SynchronizedReactiveProperty so it flips the
    /// instant the writer detects a transition.
    /// </summary>
    public class RosterTab : ICitizensTab
    {
        const int RefreshIntervalMs = 500;

        readonly LocaleService _locale;
        readonly ActivityFeedService _activity;
        readonly CameraService _camera;
        readonly IPublisher<PossessUnitMessage> _possessPub;

        readonly List<RosterEntry> _entries = new List<RosterEntry>();
        readonly Dictionary<Entity, RosterEntry> _entryByEntity = new Dictionary<Entity, RosterEntry>();

        VisualElement _root;
        ScrollView _list;
        VisualElement _detail;
        Label _detailTitle;
        Label _detailActivity;
        Label _detailStats;
        Button _jumpBtn;
        Button _possessBtn;
        IVisualElementScheduledItem _refreshTick;
        IDisposable _activitySub;
        Entity _selected;

        public string Title => "Roster";

        public RosterTab(LocaleService locale,
                         ActivityFeedService activity,
                         CameraService camera,
                         IPublisher<PossessUnitMessage> possessPub)
        {
            _locale     = locale;
            _activity   = activity;
            _camera     = camera;
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

        // --- Left pane: scrollable citizen list -------------------------------

        void BuildList(VisualElement parent)
        {
            var leftCol = new VisualElement();
            leftCol.style.flexGrow = 1;
            leftCol.style.flexBasis = 0;
            leftCol.style.marginRight = 8;

            var header = UIStyles.MakeHeading("Citizens", fontSize: 13);
            header.style.marginBottom = 6;
            leftCol.Add(header);

            _list = new ScrollView(ScrollViewMode.Vertical);
            _list.style.flexGrow = 1;
            _list.style.maxHeight = 280;
            leftCol.Add(_list);

            parent.Add(leftCol);
        }

        // --- Right pane: per-citizen detail card ------------------------------

        void BuildDetail(VisualElement parent)
        {
            _detail = new VisualElement();
            _detail.style.flexGrow = 1;
            _detail.style.flexBasis = 0;
            _detail.style.Padding(8, 10);
            _detail.style.BorderRadius(UIStyles.Radius.Sharp);
            _detail.style.BorderWidth(1);
            _detail.style.BorderColor(UIStyles.Palette.BorderSubtle);
            _detail.style.backgroundColor = UIStyles.Palette.Zinc900;

            _detailTitle = new Label("Select a citizen");
            _detailTitle.style.color = UIStyles.Palette.TextStrong;
            _detailTitle.style.fontSize = 14;
            _detailTitle.style.unityFontStyleAndWeight = FontStyle.Bold;
            _detailTitle.style.marginBottom = 6;
            _detail.Add(_detailTitle);

            _detailActivity = new Label(string.Empty);
            _detailActivity.style.color = UIStyles.Palette.GoldDeep;
            _detailActivity.style.fontSize = 12;
            _detailActivity.style.marginBottom = 6;
            _detail.Add(_detailActivity);

            _detailStats = new Label(string.Empty);
            _detailStats.style.color = UIStyles.Palette.TextStrong;
            _detailStats.style.fontSize = 12;
            _detailStats.style.whiteSpace = WhiteSpace.Normal;
            _detailStats.style.marginBottom = 8;
            _detail.Add(_detailStats);

            var actionRow = new VisualElement();
            actionRow.style.flexDirection = FlexDirection.Row;

            _jumpBtn = UIStyles.MakeYorhaButton(_locale.Get("ui.jump_to"), JumpToSelected);
            _jumpBtn.style.height = 22;
            _jumpBtn.style.fontSize = 11;
            _jumpBtn.style.Padding(0, 8);
            _jumpBtn.style.marginRight = 6;
            _jumpBtn.SetEnabled(false);
            actionRow.Add(_jumpBtn);

            _possessBtn = UIStyles.MakeYorhaButton(_locale.Get("ui.possess"), PossessSelected);
            _possessBtn.style.height = 22;
            _possessBtn.style.fontSize = 11;
            _possessBtn.style.Padding(0, 8);
            _possessBtn.SetEnabled(false);
            actionRow.Add(_possessBtn);

            _detail.Add(actionRow);
            parent.Add(_detail);
        }

        // --- Lifecycle --------------------------------------------------------

        public void OnActivated()
        {
            RebuildList();
            _refreshTick = _root.schedule.Execute(RebuildList).Every(RefreshIntervalMs);
        }

        public void Dispose()
        {
            _refreshTick?.Pause();
            _refreshTick = null;
            _activitySub?.Dispose();
            _activitySub = null;
        }

        // --- List rebuild + per-row refresh -----------------------------------

        // Rows are created lazily; revisits update existing labels in place
        // so the panel doesn't churn UI elements every 500ms.
        void RebuildList()
        {
            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;

            using var query = em.CreateEntityQuery(
                ComponentType.ReadOnly<Unit>(),
                ComponentType.ReadOnly<Faction>());
            using var entities = query.ToEntityArray(Allocator.Temp);

            // Mark all existing entries stale; we'll un-mark live ones below
            // and remove anything still stale at the end.
            for (int i = 0; i < _entries.Count; i++) _entries[i].Live = false;

            for (int i = 0; i < entities.Length; i++)
            {
                var e = entities[i];
                var faction = em.GetComponentData<Faction>(e);
                if (faction.Value != FactionType.Player) continue;

                if (!_entryByEntity.TryGetValue(e, out var entry))
                {
                    entry = CreateRow(e);
                    _entryByEntity[e] = entry;
                    _entries.Add(entry);
                    _list.Add(entry.Element);
                }
                entry.Live = true;
                RefreshRow(entry, em);
            }

            // Drop stale rows (entities that no longer exist).
            for (int i = _entries.Count - 1; i >= 0; i--)
            {
                if (_entries[i].Live) continue;
                _list.Remove(_entries[i].Element);
                _entryByEntity.Remove(_entries[i].Entity);
                if (_entries[i].Entity == _selected) ClearSelection();
                _entries.RemoveAt(i);
            }

            // Refresh the detail card for the currently-selected unit
            // (HP/needs change continuously and aren't reactive).
            if (_selected != Entity.Null && _entryByEntity.ContainsKey(_selected))
                RefreshDetail(em, _selected);
        }

        RosterEntry CreateRow(Entity entity)
        {
            var row = new VisualElement();
            row.style.flexDirection = FlexDirection.Row;
            row.style.alignItems = Align.Center;
            row.style.justifyContent = Justify.SpaceBetween;
            row.style.Padding(4, 6);
            row.style.marginBottom = 2;
            row.style.BorderRadius(UIStyles.Radius.Sharp);

            var name = new Label(string.Empty);
            name.style.color = UIStyles.Palette.TextStrong;
            name.style.fontSize = 12;
            row.Add(name);

            var hp = new Label(string.Empty);
            hp.style.color = UIStyles.Palette.TextMuted;
            hp.style.fontSize = 11;
            row.Add(hp);

            var entry = new RosterEntry
            {
                Entity = entity,
                Element = row,
                NameLabel = name,
                HpLabel = hp,
                Live = true,
            };
            row.RegisterCallback<ClickEvent>(_ => Select(entry.Entity));
            return entry;
        }

        void RefreshRow(RosterEntry entry, EntityManager em)
        {
            var unit = em.GetComponentData<Unit>(entry.Entity);
            entry.NameLabel.text = ResolveLabel(em, entry.Entity, unit.Type);

            if (em.HasComponent<Health>(entry.Entity))
            {
                var h = em.GetComponentData<Health>(entry.Entity);
                entry.HpLabel.text = ZString.Format("{0}/{1}",
                    (int)Mathf.Round(h.Value), (int)Mathf.Round(h.Max));
                bool wounded = h.Max > 0f && h.Value * 2f < h.Max;
                entry.HpLabel.style.color = wounded
                    ? UIStyles.Palette.Alert
                    : UIStyles.Palette.TextMuted;
            }
            else
            {
                entry.HpLabel.text = string.Empty;
            }

            // Highlight the selected row.
            entry.Element.style.backgroundColor = entry.Entity == _selected
                ? UIStyles.Palette.Zinc800
                : new StyleColor(StyleKeyword.Initial);
        }

        // --- Selection + activity subscription --------------------------------

        void Select(Entity entity)
        {
            _selected = entity;
            for (int i = 0; i < _entries.Count; i++)
            {
                _entries[i].Element.style.backgroundColor = _entries[i].Entity == entity
                    ? UIStyles.Palette.Zinc800
                    : new StyleColor(StyleKeyword.Initial);
            }

            // Resubscribe the activity line to the new entity. R3 dedupes
            // so the label only re-renders when the writer detects a
            // transition — no per-frame label churn.
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
            _detailStats.text = string.Empty;
            _jumpBtn.SetEnabled(false);
            _possessBtn.SetEnabled(false);
        }

        // --- Detail card refresh ---------------------------------------------

        void RefreshDetail(EntityManager em, Entity entity)
        {
            if (!em.Exists(entity))
            {
                ClearSelection();
                return;
            }

            var unit = em.GetComponentData<Unit>(entity);
            _detailTitle.text = ResolveLabel(em, entity, unit.Type);

            var sb = ZString.CreateStringBuilder();
            try
            {
                AppendStat(ref sb, em, entity, "HP",
                    has: em.HasComponent<Health>(entity),
                    value: em.HasComponent<Health>(entity) ? em.GetComponentData<Health>(entity).Value : 0f,
                    max:   em.HasComponent<Health>(entity) ? em.GetComponentData<Health>(entity).Max   : 0f);
                AppendStat(ref sb, em, entity, "EN",
                    has: em.HasComponent<Energy>(entity),
                    value: em.HasComponent<Energy>(entity) ? em.GetComponentData<Energy>(entity).Value : 0f,
                    max:   em.HasComponent<Energy>(entity) ? em.GetComponentData<Energy>(entity).Max   : 0f);
                AppendStat(ref sb, em, entity, "HU",
                    has: em.HasComponent<Hunger>(entity),
                    value: em.HasComponent<Hunger>(entity) ? em.GetComponentData<Hunger>(entity).Value : 0f,
                    max:   em.HasComponent<Hunger>(entity) ? em.GetComponentData<Hunger>(entity).Max   : 0f);
                AppendStat(ref sb, em, entity, "FT",
                    has: em.HasComponent<Fatigue>(entity),
                    value: em.HasComponent<Fatigue>(entity) ? em.GetComponentData<Fatigue>(entity).Value : 0f,
                    max:   em.HasComponent<Fatigue>(entity) ? em.GetComponentData<Fatigue>(entity).Max   : 0f);
                _detailStats.text = sb.ToString();
            }
            finally { sb.Dispose(); }

            // Defensive — the activity property may not have an emitted
            // value yet on the very first selection (writer hasn't run a
            // transition for this entity). Pull the current snapshot
            // directly so the label populates immediately.
            var snapshot = _activity.CurrentFor(entity);
            string activityLabel = _locale.GetActivityName(snapshot.Kind);
            _detailActivity.text = activityLabel.Length > 0 ? activityLabel : _locale.Get("activity.idle");
        }

        static void AppendStat(ref Cysharp.Text.Utf16ValueStringBuilder sb,
                               EntityManager em, Entity entity,
                               string label, bool has, float value, float max)
        {
            if (!has || max <= 0f) return;
            if (sb.Length > 0) sb.Append("  ");
            sb.Append(label);
            sb.Append(' ');
            sb.Append((int)Mathf.Round(value));
            sb.Append('/');
            sb.Append((int)Mathf.Round(max));
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

        // --- Action buttons ---------------------------------------------------

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

        sealed class RosterEntry
        {
            public Entity Entity;
            public VisualElement Element;
            public Label NameLabel;
            public Label HpLabel;
            public bool Live;
        }
    }
}
