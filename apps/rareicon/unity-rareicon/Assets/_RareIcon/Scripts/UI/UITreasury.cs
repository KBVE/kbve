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
    /// Top-right panel that lists everything held in central storage
    /// (the Capital building's <see cref="InventorySlot"/> buffer).
    ///
    /// Toggled by the "Treasury" button in WorldHUD's toolbar. Read-only
    /// for v1 — drop / take / craft actions land in their own slices.
    /// Refreshes on a 500ms tick while visible; pauses when hidden so we
    /// don't poll the EntityManager when nobody's looking.
    /// </summary>
    public class UITreasury : IAsyncStartable, IDisposable
    {
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
            if (uiDoc == null)
            {
                Debug.LogError("[UITreasury] UIPanelManager has no UIDocument");
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
                Debug.LogError("[UITreasury] rootVisualElement still null");
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
                        // Poll while visible — capital storage churns when
                        // goblins deposit / hungry units withdraw.
                        _refreshTick = _root.schedule.Execute(Refresh).Every(500);
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

        void BuildUI(VisualElement parent)
        {
            _root = new VisualElement().ApplyPanelChrome();
            _root.style.AnchorTopRight();
            _root.style.minWidth = UIStyles.PanelWidth.StdMin;
            _root.style.maxWidth = new Length(UIStyles.VwMaxPct.Std, LengthUnit.Percent);
            _root.style.display = DisplayStyle.None;

            UIStyles.MakePanelHeader(_root, _locale.Get("treasury.title"), Close);

            // Body — one big multi-line label so we don't churn child
            // elements every refresh. Re-rendered as a single string.
            _bodyLabel = new Label(string.Empty);
            _bodyLabel.style.color = UIStyles.Palette.TextStrong;
            _bodyLabel.style.fontSize = UIStyles.Type.BodyLg;
            _bodyLabel.style.whiteSpace = WhiteSpace.Normal;
            _root.Add(_bodyLabel);

            parent.Add(_root);
        }

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

            // ZString avoids allocating intermediate strings each tick;
            // the panel refreshes twice a second so it adds up.
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
            finally
            {
                sb.Dispose();
            }
        }

        public void Dispose()
        {
            _refreshTick?.Pause();
            _refreshTick = null;
            _disposables?.Dispose();
        }
    }
}
