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
            // Full-screen scrim. Clicks dismiss the modal via the controller.
            _backdrop = new VisualElement();
            _backdrop.style.position = Position.Absolute;
            _backdrop.style.top = 0;
            _backdrop.style.left = 0;
            _backdrop.style.right = 0;
            _backdrop.style.bottom = 0;
            _backdrop.style.backgroundColor = UIStyles.Palette.BackdropDim;
            _backdrop.style.alignItems = Align.Center;
            _backdrop.style.justifyContent = Justify.Center;
            _backdrop.RegisterCallback<ClickEvent>(_ => _appState.RequestExitToWorld());

            // Modal body — heavier chrome than a side panel: opaque ModalBg
            // and 2px border to read as primary focus over the scrim.
            var modal = new VisualElement().ApplyPanelChrome(
                background: UIStyles.Palette.ModalBg,
                borderWidth: 2f,
                padV: 24, padH: 32);
            modal.style.minWidth = 320;
            modal.style.alignItems = Align.Center;
            modal.RegisterCallback<ClickEvent>(e => e.StopPropagation());

            _titleLabel = UIStyles.MakeHeading("Enter Tile", fontSize: 22);
            _titleLabel.style.marginBottom = 20;

            // Visual rhythm under the title — ties the modal to the rest
            // of the YoRHA UI vocabulary.
            var titleStrip = UIStyles.MakeStrip(thickness: 2f);
            titleStrip.style.width = new Length(60, LengthUnit.Percent);
            titleStrip.style.marginBottom = 20;

            var buttonRow = new VisualElement();
            buttonRow.style.flexDirection = FlexDirection.Row;
            buttonRow.style.justifyContent = Justify.SpaceAround;
            buttonRow.style.width = Length.Percent(100);

            _confirmButton = UIStyles.MakeYorhaButton("Confirm", OnConfirm);
            _confirmButton.style.width = 120;
            _confirmButton.style.height = 36;

            // Cancel uses the alert palette so it reads as a destructive
            // action. Hover-invert behaviour from MakeYorhaButton still applies.
            _cancelButton = UIStyles.MakeYorhaButton("Cancel", OnCancel);
            _cancelButton.style.width = 120;
            _cancelButton.style.height = 36;
            _cancelButton.style.BorderColor(UIStyles.Palette.Alert);
            _cancelButton.style.color = UIStyles.Palette.Alert;

            buttonRow.Add(_confirmButton);
            buttonRow.Add(_cancelButton);

            modal.Add(_titleLabel);
            modal.Add(titleStrip);
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
