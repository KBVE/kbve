using System;
using System.Threading;
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
    /// Pooled modal — appears on hex click via MessagePipe.
    /// IStartable + IDisposable for VContainer-managed lifecycle.
    /// ThrottleFirst prevents click bleed-through.
    /// </summary>
    public class HexEnterModal : IAsyncStartable, IDisposable
    {
        readonly LocaleService _locale;
        readonly UIPanelManager _panelManager;
        readonly ISubscriber<HexClickedMessage> _clickSub;
        readonly IPublisher<EnterTileMessage> _enterPublisher;

        readonly CompositeDisposable _disposables = new();
        // Modal state — main-thread only (MessagePipe + UI events are main thread)
        readonly ReactiveProperty<bool> _isOpen = new(false);
        public ReadOnlyReactiveProperty<bool> IsOpen => _isOpen;

        VisualElement _backdrop;
        Label _titleLabel;
        Button _confirmButton;
        Button _cancelButton;

        int _q, _r;
        byte _biomeId;
        bool _isLand;

        [Inject]
        public HexEnterModal(
            LocaleService locale,
            UIPanelManager panelManager,
            ISubscriber<HexClickedMessage> clickSub,
            IPublisher<EnterTileMessage> enterPublisher)
        {
            _locale = locale;
            _panelManager = panelManager;
            _clickSub = clickSub;
            _enterPublisher = enterPublisher;
        }

        public async UniTask StartAsync(CancellationToken cancellation)
        {
            var uiDoc = _panelManager.GetComponent<UIDocument>();
            if (uiDoc == null)
            {
                Debug.LogError("[HexEnterModal] UIPanelManager has no UIDocument");
                return;
            }

            // Wait for rootVisualElement to be ready
            int waited = 0;
            while (uiDoc.rootVisualElement == null && waited < 1000)
            {
                await UniTask.Delay(50, cancellationToken: cancellation);
                waited += 50;
            }

            if (uiDoc.rootVisualElement == null)
            {
                Debug.LogError("[HexEnterModal] rootVisualElement still null after 1s");
                return;
            }

            BuildUI(uiDoc.rootVisualElement);

            // Subscribe directly — hex click detection uses wasReleasedThisFrame
            // so there's no need to throttle here
            var msgBag = MessagePipe.DisposableBag.CreateBuilder();
            _clickSub.Subscribe(OnHexClicked).AddTo(msgBag);
            _disposables.Add(msgBag.Build());

            Debug.Log("[HexEnterModal] Created");
        }

        void BuildUI(VisualElement root)
        {
            _backdrop = new VisualElement();
            _backdrop.style.position = Position.Absolute;
            _backdrop.style.top = 0;
            _backdrop.style.left = 0;
            _backdrop.style.right = 0;
            _backdrop.style.bottom = 0;
            _backdrop.style.backgroundColor = new Color(0, 0, 0, 0.5f);
            _backdrop.style.alignItems = Align.Center;
            _backdrop.style.justifyContent = Justify.Center;
            var backdropClicks = new Subject<Unit>();
            _disposables.Add(backdropClicks);

            // Backdrop visibility driven by reactive property
            _disposables.Add(
                _isOpen.Subscribe(open =>
                    _backdrop.style.display = open ? DisplayStyle.Flex : DisplayStyle.None)
            );

            // Manually manage the close subscription so each Show resets it
            // (Switch-equivalent pattern — only the latest "wait for click" is alive)
            SerialDisposable closeWatcher = new();
            _disposables.Add(closeWatcher);

            _disposables.Add(
                _isOpen
                    .Where(open => open)
                    .Subscribe(_ =>
                    {
                        // Replace any prior subscription — disposes the old one
                        closeWatcher.Disposable = backdropClicks
                            .Skip(1)
                            .Subscribe(__ => _isOpen.Value = false);
                    })
            );

            _backdrop.RegisterCallback<ClickEvent>(_ => backdropClicks.OnNext(Unit.Default));

            var modal = new VisualElement();
            modal.style.backgroundColor = new Color(0.08f, 0.10f, 0.16f, 0.98f);
            modal.style.paddingTop = 24;
            modal.style.paddingBottom = 24;
            modal.style.paddingLeft = 32;
            modal.style.paddingRight = 32;
            modal.style.borderTopLeftRadius = 10;
            modal.style.borderTopRightRadius = 10;
            modal.style.borderBottomLeftRadius = 10;
            modal.style.borderBottomRightRadius = 10;
            modal.style.borderTopWidth = 2;
            modal.style.borderBottomWidth = 2;
            modal.style.borderLeftWidth = 2;
            modal.style.borderRightWidth = 2;
            var border = new Color(0.3f, 0.55f, 0.85f, 0.8f);
            modal.style.borderTopColor = border;
            modal.style.borderBottomColor = border;
            modal.style.borderLeftColor = border;
            modal.style.borderRightColor = border;
            modal.style.minWidth = 320;
            modal.style.alignItems = Align.Center;
            modal.RegisterCallback<ClickEvent>(e => e.StopPropagation());

            _titleLabel = new Label("Enter Tile");
            _titleLabel.style.color = Color.white;
            _titleLabel.style.fontSize = 22;
            _titleLabel.style.unityFontStyleAndWeight = FontStyle.Bold;
            _titleLabel.style.marginBottom = 20;

            var buttonRow = new VisualElement();
            buttonRow.style.flexDirection = FlexDirection.Row;
            buttonRow.style.justifyContent = Justify.SpaceAround;
            buttonRow.style.width = Length.Percent(100);

            _confirmButton = new Button(OnConfirm) { text = "Confirm" };
            _confirmButton.style.width = 120;
            _confirmButton.style.height = 36;
            _confirmButton.style.fontSize = 14;
            _confirmButton.style.backgroundColor = new Color(0.2f, 0.5f, 0.3f, 1f);
            _confirmButton.style.color = Color.white;
            _confirmButton.style.unityFontStyleAndWeight = FontStyle.Bold;

            _cancelButton = new Button(Hide) { text = "Cancel" };
            _cancelButton.style.width = 120;
            _cancelButton.style.height = 36;
            _cancelButton.style.fontSize = 14;
            _cancelButton.style.backgroundColor = new Color(0.4f, 0.2f, 0.2f, 1f);
            _cancelButton.style.color = Color.white;

            buttonRow.Add(_confirmButton);
            buttonRow.Add(_cancelButton);

            modal.Add(_titleLabel);
            modal.Add(buttonRow);
            _backdrop.Add(modal);
            root.Add(_backdrop);

            _backdrop.style.display = DisplayStyle.None;
        }

        void OnHexClicked(HexClickedMessage msg)
        {
            try
            {
            _q = msg.Q;
            _r = msg.R;
            _biomeId = msg.BiomeId;
            _isLand = msg.IsLand;

            string name = msg.IsLand ? _locale.GetBiomeName(msg.BiomeId) : _locale.Get("hex.empty");
            _titleLabel.text = ZString.Format("{0} {1}", _locale.Get("hex.enter"), name);
            _confirmButton.text = _locale.Get("common.confirm");
            _cancelButton.text = _locale.Get("common.cancel");

            Show();
            }
            catch (System.Exception ex)
            {
                Debug.LogError($"[HexEnterModal] Exception in OnHexClicked: {ex}");
            }
        }

        void OnConfirm()
        {
            _enterPublisher.Publish(new EnterTileMessage(_q, _r, _biomeId));
            Hide();
        }

        void Show() => _isOpen.Value = true;
        void Hide() => _isOpen.Value = false;

        public void Dispose()
        {
            _disposables?.Dispose();
            _isOpen?.Dispose();
        }
    }
}
