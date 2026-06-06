using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using MessagePipe;
using R3;
using UnityEngine;
using UnityEngine.UIElements;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Bottom-right onboarding panel driven by <see cref="TutorialDriverService"/>. Shows a short prompt + hotkey chip; hides when the message carries <see cref="TutorialStepId.None"/>. Skip button suppresses further hints for the current session.</summary>
    public sealed class UITutorialHint : IAsyncStartable, IDisposable
    {
        readonly ScreenFrameHost _frame;
        readonly ISubscriber<TutorialHintMessage> _sub;
        readonly CompositeDisposable _disposables = new();

        VisualElement _root;
        Label _prompt;
        Label _hotkey;
        Button _skip;

        bool _skipped;

        [Inject]
        public UITutorialHint(ScreenFrameHost frame, ISubscriber<TutorialHintMessage> sub)
        {
            _frame = frame;
            _sub = sub;
        }

        public async UniTask StartAsync(CancellationToken cancellation)
        {
            await _frame.Ready;
            if (cancellation.IsCancellationRequested) return;
            if (_frame.WorldOverlay == null) return;

            BuildPanel();

            var bag = MessagePipe.DisposableBag.CreateBuilder();
            _sub.Subscribe(OnHint).AddTo(bag);
            _disposables.Add(bag.Build());
        }

        void BuildPanel()
        {
            _root = new VisualElement().ApplyFantasyChrome(padV: 10, padH: 14);
            _root.style.flexDirection = FlexDirection.Column;
            _root.style.alignItems = Align.FlexEnd;
            _root.style.maxWidth = 280;
            _root.style.display = DisplayStyle.None;
            _root.pickingMode = PickingMode.Position;

            _root.style.position = Position.Absolute;
            _root.style.right    = 16;
            _root.style.bottom   = 12;

            var row = new VisualElement();
            row.style.flexDirection = FlexDirection.Row;
            row.style.alignItems = Align.Center;
            row.style.justifyContent = Justify.FlexEnd;

            _prompt = new Label();
            _prompt.style.color = UIStyles.Palette.TextStrong;
            _prompt.style.fontSize = 12;
            _prompt.style.unityTextAlign = TextAnchor.MiddleRight;
            _prompt.style.flexShrink = 1;
            _prompt.style.whiteSpace = WhiteSpace.Normal;

            _hotkey = new Label();
            _hotkey.style.color = UIStyles.Palette.GoldBright;
            _hotkey.style.backgroundColor = UIStyles.Palette.Zinc800;
            _hotkey.style.borderTopLeftRadius = 4;
            _hotkey.style.borderTopRightRadius = 4;
            _hotkey.style.borderBottomLeftRadius = 4;
            _hotkey.style.borderBottomRightRadius = 4;
            _hotkey.style.paddingLeft = 6;
            _hotkey.style.paddingRight = 6;
            _hotkey.style.paddingTop = 1;
            _hotkey.style.paddingBottom = 1;
            _hotkey.style.marginLeft = 8;
            _hotkey.style.fontSize = 12;
            _hotkey.style.unityFontStyleAndWeight = FontStyle.Bold;
            _hotkey.style.display = DisplayStyle.None;

            row.Add(_prompt);
            row.Add(_hotkey);

            _skip = new Button(() => { _skipped = true; SetVisible(false); })
            {
                text = "Skip",
            };
            _skip.style.alignSelf = Align.FlexEnd;
            _skip.style.marginTop = 4;
            _skip.style.fontSize = 10;
            _skip.style.color = UIStyles.Palette.GoldMuted;
            _skip.style.backgroundColor = new StyleColor(StyleKeyword.None);
            _skip.style.borderTopWidth = 0;
            _skip.style.borderRightWidth = 0;
            _skip.style.borderLeftWidth = 0;
            _skip.style.borderBottomWidth = 0;
            _skip.style.paddingLeft = 4;
            _skip.style.paddingRight = 4;
            _skip.style.paddingTop = 0;
            _skip.style.paddingBottom = 0;

            _root.Add(row);
            _root.Add(_skip);

            _frame.WorldOverlay.Add(_root);
        }

        void OnHint(TutorialHintMessage msg)
        {
            if (_root == null) return;
            if (_skipped || msg.Step == TutorialStepId.None)
            {
                SetVisible(false);
                return;
            }
            _prompt.text = msg.Text ?? string.Empty;
            if (string.IsNullOrEmpty(msg.Hotkey))
            {
                _hotkey.style.display = DisplayStyle.None;
            }
            else
            {
                _hotkey.text = msg.Hotkey;
                _hotkey.style.display = DisplayStyle.Flex;
            }
            ApplyTone(msg.Tone);
            SetVisible(true);
        }

        void ApplyTone(TutorialHintTone tone)
        {
            var border = tone == TutorialHintTone.Crisis
                ? UIStyles.Palette.Alert
                : UIStyles.Palette.BorderGold;
            _root.style.BorderColor(border);
            _prompt.style.color = tone == TutorialHintTone.Crisis
                ? UIStyles.Palette.Alert
                : UIStyles.Palette.TextStrong;
        }

        void SetVisible(bool visible)
        {
            if (_root == null) return;
            _root.style.display = visible ? DisplayStyle.Flex : DisplayStyle.None;
        }

        public void Dispose() => _disposables?.Dispose();
    }
}
