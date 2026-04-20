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
    /// <summary>Top-right treasury panel listing the Capital's stockpile. UXML-driven (Resources/UI/Treasury.uxml + styles.uss); controller does asset load + per-tick refresh.</summary>
    public class UITreasury : IAsyncStartable, IDisposable
    {
        const int RefreshIntervalMs = 500;

        readonly LocaleService _locale;
        readonly UIPanelManager _panelManager;

        readonly CompositeDisposable _disposables = new();
        readonly ReactiveProperty<bool> _isOpen = new(false);
        public ReadOnlyReactiveProperty<bool> IsOpen => _isOpen;

        VisualElement _root;
        Label _bodyLabel;
        IVisualElementScheduledItem _refreshTick;

        [Inject]
        public UITreasury(LocaleService locale, UIPanelManager panelManager)
        {
            _locale = locale;
            _panelManager = panelManager;
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

            var template = Resources.Load<VisualTreeAsset>("UI/Treasury");
            if (template == null)
            {
                Debug.LogError("[UITreasury] Resources/UI/Treasury.uxml not found");
                return;
            }
            var styles = Resources.Load<StyleSheet>("UI/styles");

            _root = template.CloneTree();
            if (styles != null) _root.styleSheets.Add(styles);
            uiDoc.rootVisualElement.Add(_root);

            var rootEl     = _root.Q<VisualElement>("treasury-root");
            var titleLabel = _root.Q<Label>("treasury-title");
            var closeBtn   = _root.Q<Button>("treasury-close");
            _bodyLabel     = _root.Q<Label>("treasury-body");

            titleLabel.text = _locale.Get("treasury.title");
            closeBtn.clicked += Close;

            _isOpen
                .Subscribe(open =>
                {
                    if (open) rootEl.RemoveFromClassList("is-hidden");
                    else      rootEl.AddToClassList("is-hidden");

                    if (open)
                    {
                        Refresh();
                        _refreshTick = rootEl.schedule.Execute(Refresh).Every(RefreshIntervalMs);
                    }
                    else
                    {
                        _refreshTick?.Pause();
                        _refreshTick = null;
                    }
                })
                .AddTo(_disposables);
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

            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;

            if (!em.HasBuffer<InventorySlot>(capital))
            {
                _bodyLabel.text = _locale.Get("treasury.no_capital");
                return;
            }

            var slots = em.GetBuffer<InventorySlot>(capital);
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
            _refreshTick?.Pause();
            _refreshTick = null;
            _disposables?.Dispose();
        }
    }
}
