using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using R3;
using UnityEngine;
using UnityEngine.UIElements;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Full-screen loss panel — mounts when <see cref="AppStateController"/> enters <see cref="AppInterfaceState.GameOver"/>, hides otherwise. Inline-built (no UXML) like <see cref="PauseIndicator"/> so it ships with no extra Resources asset. Returns to the title via <see cref="AppStateController.ReturnToMainMenu"/>; world cleanup on restart is the title screen's responsibility.</summary>
    public sealed class UIGameOverScreen : IAsyncStartable, IDisposable
    {
        readonly AppStateController _appState;
        readonly UIPanelManager _panelManager;
        readonly LocaleService _locale;
        readonly CompositeDisposable _disposables = new();

        VisualElement _root;
        Label _title;
        Label _subtitle;
        Button _returnBtn;

        [Inject]
        public UIGameOverScreen(AppStateController appState, UIPanelManager panelManager, LocaleService locale)
        {
            _appState = appState;
            _panelManager = panelManager;
            _locale = locale;
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

            BuildPanel(uiDoc.rootVisualElement);

            _appState.Current
                .Subscribe(state => SetVisible(state == AppInterfaceState.GameOver))
                .AddTo(_disposables);
        }

        void BuildPanel(VisualElement uiRoot)
        {
            _root = new VisualElement();
            _root.style.position = Position.Absolute;
            _root.style.left = 0;
            _root.style.right = 0;
            _root.style.top = 0;
            _root.style.bottom = 0;
            _root.style.flexDirection = FlexDirection.Column;
            _root.style.alignItems = Align.Center;
            _root.style.justifyContent = Justify.Center;
            _root.style.backgroundColor = UIStyles.Palette.BackdropDim;
            _root.style.display = DisplayStyle.None;
            _root.pickingMode = PickingMode.Position;

            var card = new VisualElement().ApplyPanelChrome(padV: 24, padH: 32);
            card.style.alignItems = Align.Center;
            card.style.minWidth = 360;

            _title = UIStyles.MakeHeading("The Empire Has Fallen", fontSize: 22);
            _title.style.unityTextAlign = TextAnchor.MiddleCenter;
            _title.style.marginBottom = 8;

            _subtitle = new Label("The Capital was destroyed. The run ends here.");
            _subtitle.style.color = UIStyles.Palette.GoldMuted;
            _subtitle.style.fontSize = 13;
            _subtitle.style.unityTextAlign = TextAnchor.MiddleCenter;
            _subtitle.style.marginBottom = 20;
            _subtitle.style.whiteSpace = WhiteSpace.Normal;
            _subtitle.style.maxWidth = 340;

            _returnBtn = new Button(() => _appState.ReturnToMainMenu()) { text = "Return to Title" };
            _returnBtn.style.minWidth = 200;
            _returnBtn.style.paddingLeft = 16;
            _returnBtn.style.paddingRight = 16;
            _returnBtn.style.paddingTop = 8;
            _returnBtn.style.paddingBottom = 8;
            _returnBtn.style.color = UIStyles.Palette.GoldBright;
            _returnBtn.style.backgroundColor = UIStyles.Palette.ButtonBg;

            card.Add(_title);
            card.Add(_subtitle);
            card.Add(_returnBtn);
            _root.Add(card);
            uiRoot.Add(_root);
        }

        void SetVisible(bool visible)
        {
            if (_root == null) return;
            _root.style.display = visible ? DisplayStyle.Flex : DisplayStyle.None;
            if (visible) _root.BringToFront();
        }

        public void Dispose() => _disposables?.Dispose();
    }
}
