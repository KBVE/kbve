using System;
using System.Collections.Generic;
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
    /// <summary>Player-facing toast queue. Subscribes to <see cref="ToastMessage"/> and stacks up to <see cref="MaxVisible"/> toasts bottom-center, NieR/YoRHA chrome with a per-kind border tint. Older toasts shift up, shrink, and dim like a card deck so the newest is always the most prominent.</summary>
    public class ToastService : IAsyncStartable, IDisposable
    {
        const int   MaxVisible       = 5;
        const float DisplayDuration  = 5f;
        const int   TickIntervalMs   = 100;
        const float MinWidth         = 220f;
        const float MaxWidth         = 380f;
        const int   StackShiftPx     = 4;
        const float StackScaleStep   = 0.03f;
        const float StackOpacityStep = 0.16f;

        readonly UIPanelManager _panelManager;
        readonly ISubscriber<ToastMessage> _sub;

        readonly CompositeDisposable _disposables = new();
        readonly Queue<ToastMessage> _queue  = new();
        readonly List<ToastSlot>     _active = new();
        readonly Stack<ToastSlot>    _free   = new();

        VisualElement _container;

        [Inject]
        public ToastService(UIPanelManager panelManager, ISubscriber<ToastMessage> sub)
        {
            _panelManager = panelManager;
            _sub = sub;
        }

        public async UniTask StartAsync(CancellationToken cancellation)
        {
            var uiDoc = _panelManager.GetComponent<UIDocument>();
            if (uiDoc == null)
            {
                Debug.LogError("[ToastService] UIPanelManager has no UIDocument");
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
                Debug.LogError("[ToastService] rootVisualElement still null");
                return;
            }

            BuildUI(uiDoc.rootVisualElement);

            var bag = MessagePipe.DisposableBag.CreateBuilder();
            _sub.Subscribe(OnToastMessage).AddTo(bag);
            _disposables.Add(bag.Build());

            _container.schedule.Execute(Tick).Every(TickIntervalMs);
        }

        void BuildUI(VisualElement root)
        {
            _container = new VisualElement();
            _container.style.position = Position.Absolute;
            _container.style.bottom = new Length(5, LengthUnit.Percent);
            _container.style.left = 0;
            _container.style.right = 0;
            _container.style.flexDirection = FlexDirection.Column;
            _container.style.alignItems = Align.Center;
            _container.pickingMode = PickingMode.Ignore;
            root.Add(_container);

            for (int i = 0; i < MaxVisible + 1; i++)
                _free.Push(new ToastSlot(_container));
        }

        void OnToastMessage(ToastMessage msg) => _queue.Enqueue(msg);

        void Tick()
        {
            float now = Time.time;

            for (int i = _active.Count - 1; i >= 0; i--)
            {
                if (now < _active[i].ExpiresAt) continue;
                var slot = _active[i];
                slot.Hide();
                _active.RemoveAt(i);
                _free.Push(slot);
            }

            while (_queue.Count > 0)
            {
                if (_active.Count >= MaxVisible)
                {
                    var oldest = _active[0];
                    oldest.Hide();
                    _active.RemoveAt(0);
                    _free.Push(oldest);
                }

                var slot = _free.Count > 0 ? _free.Pop() : new ToastSlot(_container);
                var msg  = _queue.Dequeue();
                slot.Show(msg, now + DisplayDuration);
                _active.Add(slot);
            }

            RefreshStack();
        }

        void RefreshStack()
        {
            int n = _active.Count;
            for (int i = 0; i < n; i++)
            {
                int stackIndex = (n - 1) - i;
                _active[i].ApplyStack(stackIndex);
                _active[i].Root.BringToFront();
            }
        }

        public void Dispose() => _disposables?.Dispose();

        sealed class ToastSlot
        {
            VisualElement _root;
            Label _label;
            int _stackIndex;
            public bool  Active;
            public float ExpiresAt;
            public VisualElement Root => _root;

            public ToastSlot(VisualElement parent)
            {
                _root = new VisualElement().ApplyPanelChrome(padV: 6, padH: 14);
                _root.style.minWidth = MinWidth;
                _root.style.maxWidth = MaxWidth;
                _root.style.marginBottom = 3;
                _root.style.display = DisplayStyle.None;
                _root.style.opacity = 0f;
                _root.style.translate = new Translate(0, 24);
                _root.style.scale = new Scale(new Vector3(0.95f, 0.95f, 1f));
                _root.style.transformOrigin = new TransformOrigin(
                    new Length(50, LengthUnit.Percent),
                    new Length(100, LengthUnit.Percent));
                _root.style.transitionProperty = new List<StylePropertyName>
                {
                    new StylePropertyName("opacity"),
                    new StylePropertyName("translate"),
                    new StylePropertyName("scale"),
                };
                _root.style.transitionDuration = new List<TimeValue>
                {
                    new TimeValue(220, TimeUnit.Millisecond),
                };
                _root.style.transitionTimingFunction = new List<EasingFunction>
                {
                    new EasingFunction(EasingMode.EaseOutCubic),
                };
                _root.pickingMode = PickingMode.Ignore;

                _label = new Label("");
                _label.style.color = UIStyles.Palette.TextStrong;
                _label.style.fontSize = 13;
                _label.style.unityFontStyleAndWeight = FontStyle.Bold;
                _label.style.unityTextAlign = TextAnchor.MiddleCenter;
                _label.style.whiteSpace = WhiteSpace.Normal;
                _label.pickingMode = PickingMode.Ignore;
                _root.Add(_label);

                parent.Add(_root);
            }

            public void Show(ToastMessage msg, float expiresAt)
            {
                _label.text = msg.Text;
                _root.style.BorderColor(BorderForKind(msg.Kind));
                _root.style.display = DisplayStyle.Flex;
                Active = true;
                ExpiresAt = expiresAt;
                _stackIndex = 0;
                _root.schedule.Execute(() => ApplyResting()).StartingIn(16);
            }

            public void Hide()
            {
                _root.style.opacity = 0f;
                _root.style.translate = new Translate(0, 24);
                _root.style.scale = new Scale(new Vector3(0.95f, 0.95f, 1f));
                _root.schedule.Execute(() =>
                {
                    if (!Active) _root.style.display = DisplayStyle.None;
                }).StartingIn(240);
                Active = false;
                ExpiresAt = 0f;
            }

            public void ApplyStack(int stackIndex)
            {
                _stackIndex = stackIndex;
                if (Active) ApplyResting();
            }

            void ApplyResting()
            {
                float shift   = -_stackIndex * StackShiftPx;
                float scale   = 1f - _stackIndex * StackScaleStep;
                float opacity = Mathf.Max(0f, 1f - _stackIndex * StackOpacityStep);
                _root.style.translate = new Translate(0, shift);
                _root.style.scale = new Scale(new Vector3(scale, scale, 1f));
                _root.style.opacity = opacity;
            }

            static Color BorderForKind(ToastKind kind) => kind switch
            {
                ToastKind.Success => UIStyles.Palette.Success,
                ToastKind.Warning => UIStyles.Palette.GoldDeep,
                ToastKind.Error   => UIStyles.Palette.Alert,
                _                 => UIStyles.Palette.BorderGold,
            };
        }
    }
}
