using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using R3;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Top-right overlay that shows while the game is paused, displays the active pause reason, and binds F9 as a debug manual-toggle.</summary>
    public class PauseIndicator : IAsyncStartable, IDisposable
    {
        readonly PauseService _pause;
        readonly LocaleService _locale;
        readonly UIPanelManager _panelManager;

        readonly CompositeDisposable _disposables = new();

        VisualElement _root;
        Label _titleLabel;
        Label _reasonLabel;

        [Inject]
        public PauseIndicator(
            PauseService pause,
            LocaleService locale,
            UIPanelManager panelManager)
        {
            _pause = pause;
            _locale = locale;
            _panelManager = panelManager;
        }

        public async UniTask StartAsync(CancellationToken cancellation)
        {
            var uiDoc = _panelManager.GetComponent<UIDocument>();
            if (uiDoc == null)
            {
                Debug.LogError("[PauseIndicator] UIPanelManager has no UIDocument");
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
                Debug.LogError("[PauseIndicator] rootVisualElement still null");
                return;
            }

            BuildUI(uiDoc.rootVisualElement);

            _pause.IsPausedRx
                .Subscribe(OnPausedChanged)
                .AddTo(_disposables);
        }

        void BuildUI(VisualElement root)
        {
            _root = new VisualElement().ApplyPanelChrome(padV: 8, padH: 16);
            _root.style.position = Position.Absolute;
            _root.style.top = 16;
            _root.style.right = 16;
            _root.style.flexDirection = FlexDirection.Column;
            _root.style.alignItems = Align.Center;
            _root.pickingMode = PickingMode.Ignore;
            _root.style.display = DisplayStyle.None;

            _titleLabel = UIStyles.MakeHeading(_locale.Get("pause.title"), fontSize: 16);
            _titleLabel.style.unityTextAlign = TextAnchor.MiddleCenter;

            _reasonLabel = new Label();
            _reasonLabel.style.color = UIStyles.Palette.GoldMuted;
            _reasonLabel.style.fontSize = 11;
            _reasonLabel.style.unityTextAlign = TextAnchor.MiddleCenter;
            _reasonLabel.style.marginTop = 2;

            _root.Add(_titleLabel);
            _root.Add(_reasonLabel);
            root.Add(_root);

            // Debug toggle + indicator refresh cadence. Scheduled on the
            // always-present uiDoc root so it keeps firing even while the
            // indicator itself is hidden.
            root.schedule.Execute(Tick).Every(16);
        }

        void Tick()
        {
            var keyboard = Keyboard.current;
            if (keyboard == null) return;
            if (keyboard.f9Key.wasPressedThisFrame)
            {
                if (_pause.IsPaused && _pause.TopReason == PauseReason.Manual)
                    _pause.Resume(PauseReason.Manual);
                else
                    _pause.Pause(PauseReason.Manual);
            }
        }

        void OnPausedChanged(bool paused)
        {
            if (_root == null) return;
            _root.style.display = paused ? DisplayStyle.Flex : DisplayStyle.None;
            if (paused)
                _reasonLabel.text = _locale.Get(ReasonKey(_pause.TopReason));
        }

        static string ReasonKey(PauseReason r) => r switch
        {
            PauseReason.Manual   => "pause.reason.manual",
            PauseReason.Dialogue => "pause.reason.dialogue",
            _                    => "pause.title",
        };

        public void Dispose() => _disposables?.Dispose();
    }
}
