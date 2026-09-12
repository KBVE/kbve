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
    /// <summary>Top-right treasury panel listing the Capital's stockpile. UXML-driven (Resources/UI/Treasury.uxml + styles.uss); refreshes on InventoryChangedMessage filtered by Capital.</summary>
    public class UITreasury : IAsyncStartable, IDisposable
    {
        readonly LocaleService _locale;
        readonly UIPanelManager _panelManager;
        readonly ISubscriber<InventoryChangedMessage> _inventorySub;

        readonly CompositeDisposable _disposables = new();
        readonly ReactiveProperty<bool> _isOpen = new(false);
        public ReadOnlyReactiveProperty<bool> IsOpen => _isOpen;

        const long RefreshDebounceMs = 350;

        VisualElement _root;
        Label _bodyLabel;
        bool _refreshScheduled;

        [Inject]
        public UITreasury(LocaleService locale, UIPanelManager panelManager,
                          ISubscriber<InventoryChangedMessage> inventorySub)
        {
            _locale        = locale;
            _panelManager  = panelManager;
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

            _root = UIPanelLoader.Load(uiDoc, "UI/Treasury");
            if (_root == null) return;

            var wrapper    = _root.Q<VisualElement>("treasury-wrapper");
            var rootEl     = _root.Q<VisualElement>("treasury-root");
            var backdrop   = _root.Q<VisualElement>("treasury-backdrop");
            var titleLabel = _root.Q<Label>("treasury-title");
            var closeBtn   = _root.Q<Button>("treasury-close");
            _bodyLabel     = _root.Q<Label>("treasury-body");

            titleLabel.text = _locale.Get("treasury.title");
            closeBtn.clicked += Close;
            backdrop.RegisterCallback<ClickEvent>(_ => Close());
            rootEl.RegisterCallback<ClickEvent>(e => e.StopPropagation());

            _isOpen
                .Subscribe(open =>
                {
                    if (open) { wrapper.RemoveFromClassList("is-hidden"); _root.BringToFront(); Refresh(); }
                    else      wrapper.AddToClassList("is-hidden");
                })
                .AddTo(_disposables);

            var bag = MessagePipe.DisposableBag.CreateBuilder();
            _inventorySub.Subscribe(OnInventoryChanged).AddTo(bag);
            _disposables.Add(bag.Build());
        }

        void OnInventoryChanged(InventoryChangedMessage msg)
        {
            if (!_isOpen.Value) return;
            if (!CapitalLocator.TryGetEntity(out var capital)) return;
            if (msg.Bank != capital) return;
            ScheduleRefresh();
        }

        void ScheduleRefresh()
        {
            if (_refreshScheduled) return;
            if (_root == null) return;
            _refreshScheduled = true;
            _root.schedule.Execute(() =>
            {
                _refreshScheduled = false;
                if (_isOpen.Value) Refresh();
            }).StartingIn(RefreshDebounceMs);
        }

        public void Toggle() => _isOpen.Value = !_isOpen.Value;
        public void Open()   => _isOpen.Value = true;
        public void Close()  => _isOpen.Value = false;

        void Refresh()
        {
            if (_bodyLabel == null) return;

            if (!CapitalLocator.TryGetEntity(out var capital))
            {
                _bodyLabel.text = _locale.Get("treasury.no_capital");
                return;
            }

            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;

            if (!em.HasBuffer<CapitalLedger>(capital))
            {
                _bodyLabel.text = _locale.Get("treasury.no_capital");
                return;
            }

            var slots = em.GetBuffer<CapitalLedger>(capital);
            if (slots.Length == 0)
            {
                _bodyLabel.text = _locale.Get("treasury.empty");
                return;
            }

            var sb = ZString.CreateStringBuilder();
            try
            {
                for (int i = 0; i < slots.Length; i++)
                {
                    var slot = slots[i];
                    if (slot.ItemId == 0 || slot.Count == 0) continue;
                    if (sb.Length > 0) sb.Append('\n');
                    sb.Append(_locale.GetItemName(slot.ItemId));
                    sb.Append(" \u00D7 ");
                    sb.Append(slot.Count);
                }
                _bodyLabel.text = sb.Length > 0
                    ? sb.ToString()
                    : _locale.Get("treasury.empty");
            }
            finally { sb.Dispose(); }
        }

        public void Dispose()
        {
            _disposables?.Dispose();
        }
    }
}
