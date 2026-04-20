using System;
using System.Collections.Generic;
using System.Threading;
using Cysharp.Text;
using Cysharp.Threading.Tasks;
using R3;
using Unity.Collections;
using Unity.Entities;
using UnityEngine;
using UnityEngine.UIElements;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Military panel — lists every armed Player unit with name / type / HP / current activity. Considers anything with MeleeAttack or RangedAttack as "armed" so goblins with a club show up alongside soldiers / knights / mages / the King.</summary>
    public class UIMilitary : IAsyncStartable, IDisposable
    {
        const int RefreshIntervalMs = 500;

        readonly LocaleService _locale;
        readonly UIPanelManager _panelManager;
        readonly ActivityFeedService _activity;

        readonly CompositeDisposable _disposables = new();
        readonly ReactiveProperty<bool> _isOpen = new(false);
        public ReadOnlyReactiveProperty<bool> IsOpen => _isOpen;

        readonly Dictionary<Entity, Row> _byEntity = new();
        readonly List<Row> _rows = new();

        VisualElement _root, _wrapper, _rowsHost;
        Label _emptyLabel;
        IVisualElementScheduledItem _refreshTick;

        [Inject]
        public UIMilitary(LocaleService locale, UIPanelManager panelManager, ActivityFeedService activity)
        {
            _locale = locale;
            _panelManager = panelManager;
            _activity = activity;
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

            _root = UIPanelLoader.Load(uiDoc, "UI/Military");
            if (_root == null) return;

            _wrapper    = _root.Q<VisualElement>("military-wrapper");
            var card    = _root.Q<VisualElement>("military-root");
            var backdrop= _root.Q<VisualElement>("military-backdrop");
            _rowsHost   = _root.Q<VisualElement>("military-rows");
            _emptyLabel = _root.Q<Label>("military-empty");

            _root.Q<Label>("military-title").text = "Military";
            _root.Q<Button>("military-close").clicked += Close;
            backdrop.RegisterCallback<ClickEvent>(_ => Close());
            card.RegisterCallback<ClickEvent>(e => e.StopPropagation());

            _isOpen.Subscribe(open =>
            {
                if (open) { _wrapper.RemoveFromClassList("is-hidden"); _root.BringToFront(); }
                else      _wrapper.AddToClassList("is-hidden");

                if (open)
                {
                    Refresh();
                    _refreshTick = _wrapper.schedule.Execute(Refresh).Every(RefreshIntervalMs);
                }
                else
                {
                    _refreshTick?.Pause();
                    _refreshTick = null;
                }
            }).AddTo(_disposables);
        }

        public void Toggle() => _isOpen.Value = !_isOpen.Value;
        public void Open()   => _isOpen.Value = true;
        public void Close()  => _isOpen.Value = false;

        void Refresh()
        {
            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;

            using var query = em.CreateEntityQuery(
                ComponentType.ReadOnly<Unit>(),
                ComponentType.ReadOnly<Faction>());
            using var entities = query.ToEntityArray(Allocator.Temp);

            for (int i = 0; i < _rows.Count; i++) _rows[i].Live = false;

            int armed = 0;
            for (int i = 0; i < entities.Length; i++)
            {
                var e = entities[i];
                if (em.GetComponentData<Faction>(e).Value != FactionType.Player) continue;
                bool hasMelee  = em.HasComponent<MeleeAttack>(e);
                bool hasRanged = em.HasComponent<RangedAttack>(e);
                if (!hasMelee && !hasRanged) continue;

                if (!_byEntity.TryGetValue(e, out var row))
                {
                    row = new Row(e);
                    _byEntity[e] = row;
                    _rows.Add(row);
                    _rowsHost.Add(row.Element);
                }
                row.Live = true;
                row.Refresh(em, _locale, _activity);
                armed++;
            }

            for (int i = _rows.Count - 1; i >= 0; i--)
            {
                if (_rows[i].Live) continue;
                _rowsHost.Remove(_rows[i].Element);
                _byEntity.Remove(_rows[i].Entity);
                _rows.RemoveAt(i);
            }

            if (armed == 0) _emptyLabel.RemoveFromClassList("is-hidden");
            else            _emptyLabel.AddToClassList("is-hidden");
        }

        public void Dispose()
        {
            _refreshTick?.Pause();
            _refreshTick = null;
            _disposables?.Dispose();
        }

        sealed class Row
        {
            public readonly Entity Entity;
            public readonly VisualElement Element;
            readonly Label _name, _hp, _activity;
            public bool Live;

            public Row(Entity entity)
            {
                Entity = entity;

                Element = new VisualElement();
                Element.AddToClassList("list-row");

                _name = new Label();
                _name.AddToClassList("text-label");
                Element.Add(_name);

                var right = new VisualElement();
                right.style.flexDirection = FlexDirection.Row;
                right.style.alignItems = Align.Center;

                _hp = new Label();
                _hp.AddToClassList("text-body");
                _hp.style.marginRight = 8;
                right.Add(_hp);

                _activity = new Label();
                _activity.AddToClassList("text-body");
                _activity.AddToClassList("text-deep");
                right.Add(_activity);

                Element.Add(right);
            }

            public void Refresh(EntityManager em, LocaleService locale, ActivityFeedService activity)
            {
                var unit = em.GetComponentData<Unit>(Entity);

                string label = string.Empty;
                if (em.HasComponent<UnitName>(Entity))
                {
                    var nm = em.GetComponentData<UnitName>(Entity);
                    label = locale.GetGoblinName(nm.FirstNameId, nm.EpithetId);
                }
                if (label.Length == 0) label = locale.GetCreatureName(unit.Type);

                var sb = ZString.CreateStringBuilder();
                try
                {
                    sb.Append(label); sb.Append(" · "); sb.Append(locale.GetCreatureName(unit.Type));
                    _name.text = sb.ToString();
                }
                finally { sb.Dispose(); }

                if (em.HasComponent<Health>(Entity))
                {
                    var h = em.GetComponentData<Health>(Entity);
                    _hp.text = ZString.Format("{0}/{1}",
                        (int)Mathf.Round(h.Value), (int)Mathf.Round(h.Max));
                }
                else _hp.text = string.Empty;

                var snap = activity.CurrentFor(Entity);
                string act = locale.GetActivityName(snap.Kind);
                _activity.text = act.Length > 0 ? act : string.Empty;
            }
        }
    }
}
