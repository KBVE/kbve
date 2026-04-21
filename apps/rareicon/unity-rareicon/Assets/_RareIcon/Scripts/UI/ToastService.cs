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
    /// <summary>
    /// Player-facing toast notification queue. Subscribes to
    /// <see cref="ToastMessage"/> and serially displays each one in a
    /// pool of UI slots anchored bottom-center, NieR/YoRHA chrome with
    /// a per-kind border tint.
    ///
    /// Pool model — <see cref="PoolSize"/> visible slots at once. v1
    /// ships with 1 (serial display per spec); raising it to 3 turns
    /// the system into a vertical stack of up to 3 toasts. No other
    /// code change needed.
    ///
    /// Replaces ad-hoc `Debug.Log` for player-facing events. Keeps the
    /// console clean and gives the player a clear visible signal.
    /// </summary>
    public class ToastService : IAsyncStartable, IDisposable
    {
        // -- Tuning --
        const int   PoolSize        = 1;     // serial display; bump for stack
        const float DisplayDuration = 5f;    // seconds visible per toast
        const int   TickIntervalMs  = 100;   // expiry check cadence
        const float MinWidth        = 320f;
        const float MaxWidth        = 600f;

        readonly UIPanelManager _panelManager;
        readonly ISubscriber<ToastMessage> _sub;

        readonly CompositeDisposable _disposables = new();
        readonly Queue<ToastMessage> _queue = new();

        VisualElement _container;
        ToastSlot[] _pool;

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

            // Subscribe to the message bus — every gameplay system that
            // wants player feedback publishes here.
            var bag = MessagePipe.DisposableBag.CreateBuilder();
            _sub.Subscribe(OnToastMessage).AddTo(bag);
            _disposables.Add(bag.Build());

            // Drive expiry / queue-pop on the container's scheduler. UI
            // Toolkit cleans this up automatically when the element is
            // detached on world teardown.
            _container.schedule.Execute(Tick).Every(TickIntervalMs);
        }

        void BuildUI(VisualElement root)
        {
            // Bottom-center anchor — full-width container, children
            // centered horizontally via alignItems. picking ignored so
            // toasts never block world clicks underneath.
            _container = new VisualElement();
            _container.style.position = Position.Absolute;
            _container.style.bottom = new Length(5, LengthUnit.Percent);
            _container.style.left = 0;
            _container.style.right = 0;
            _container.style.flexDirection = FlexDirection.Column;
            _container.style.alignItems = Align.Center;
            _container.pickingMode = PickingMode.Ignore;
            root.Add(_container);

            _pool = new ToastSlot[PoolSize];
            for (int i = 0; i < PoolSize; i++)
                _pool[i] = new ToastSlot(_container);
        }

        void OnToastMessage(ToastMessage msg)
        {
            _queue.Enqueue(msg);
        }

        // Per-tick: expire any active toast whose time is up, then fill
        // free slots from the pending queue.
        void Tick()
        {
            float now = Time.time;
            for (int i = 0; i < _pool.Length; i++)
            {
                if (_pool[i].Active && now >= _pool[i].ExpiresAt)
                    _pool[i].Hide();
            }

            for (int i = 0; i < _pool.Length && _queue.Count > 0; i++)
            {
                if (_pool[i].Active) continue;
                var msg = _queue.Dequeue();
                _pool[i].Show(msg, now + DisplayDuration);
            }
        }

        public void Dispose() => _disposables?.Dispose();

        // -- Toast slot --
        // One pooled UI element + its visibility state. Hide / Show only
        // toggle DisplayStyle + repaint chrome — no allocation per use.
        sealed class ToastSlot
        {
            VisualElement _root;
            Label _label;
            public bool  Active;
            public float ExpiresAt;

            public ToastSlot(VisualElement parent)
            {
                _root = new VisualElement().ApplyPanelChrome(padV: 10, padH: 20);
                _root.style.minWidth = MinWidth;
                _root.style.maxWidth = MaxWidth;
                _root.style.marginBottom = 4;
                _root.style.display = DisplayStyle.None;
                _root.pickingMode = PickingMode.Ignore;

                _label = new Label("");
                _label.style.color = UIStyles.Palette.TextStrong;
                _label.style.fontSize = 14;
                _label.style.unityFontStyleAndWeight = FontStyle.Bold;
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
            }

            public void Hide()
            {
                _root.style.display = DisplayStyle.None;
                Active = false;
                ExpiresAt = 0f;
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
