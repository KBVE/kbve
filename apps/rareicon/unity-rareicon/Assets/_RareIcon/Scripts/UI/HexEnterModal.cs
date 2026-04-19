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
    /// Pooled "Enter Tile" modal — visibility driven entirely by AppStateController.
    /// We never subscribe to HexClickedMessage directly; the controller is the
    /// single source of truth for which screen is showing.
    /// </summary>
    public class HexEnterModal : IAsyncStartable, IDisposable
    {
        readonly LocaleService _locale;
        readonly UIPanelManager _panelManager;
        readonly AppStateController _appState;
        readonly IPublisher<EnterTileMessage> _enterPublisher;

        readonly CompositeDisposable _disposables = new();

        VisualElement _backdrop;
        Label _titleLabel;
        Button _confirmButton;
        Button _cancelButton;

        [Inject]
        public HexEnterModal(
            LocaleService locale,
            UIPanelManager panelManager,
            AppStateController appState,
            IPublisher<EnterTileMessage> enterPublisher)
        {
            _locale = locale;
            _panelManager = panelManager;
            _appState = appState;
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

            _appState.Current
                .Subscribe(OnAppStateChanged)
                .AddTo(_disposables);
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
            // Backdrop click closes via the controller; modal stops propagation below.
            _backdrop.RegisterCallback<ClickEvent>(_ => _appState.RequestExitToWorld());

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

            _cancelButton = new Button(OnCancel) { text = "Cancel" };
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

        void OnAppStateChanged(AppInterfaceState state)
        {
            if (_backdrop == null) return;

            if (state == AppInterfaceState.EnterModal)
            {
                var msg = _appState.LastClickedHex;
                string name = msg.IsLand ? _locale.GetBiomeName(msg.BiomeId) : _locale.Get("hex.empty");
                _titleLabel.text = ZString.Format("{0} {1}", _locale.Get("hex.enter"), name);
                _confirmButton.text = _locale.Get("common.confirm");
                _cancelButton.text = _locale.Get("common.cancel");
                _backdrop.style.display = DisplayStyle.Flex;
            }
            else
            {
                _backdrop.style.display = DisplayStyle.None;
            }
        }

        void OnConfirm()
        {
            var msg = _appState.LastClickedHex;
            _enterPublisher.Publish(new EnterTileMessage(msg.Q, msg.R, msg.BiomeId));
            // Controller flips to InTile when it sees EnterTileMessage.
        }

        void OnCancel() => _appState.RequestExitToWorld();

        public void Dispose()
        {
            _disposables?.Dispose();
        }
    }
}
