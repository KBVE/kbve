using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using MessagePipe;
using R3;
using Unity.Entities;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.UIElements;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Ambient speech-bubble renderer. Fixed pool of pre-allocated <see cref="VisualElement"/>s anchored in screen space; each active slot tracks its speaker's world position every frame and auto-dismisses on <see cref="SpeechBubbleMessage.Duration"/>. LRU eviction when saturated so a horde can't grow the pool. Uses unscaled time so bubbles tick normally while other things pause.</summary>
    public class DialogueBubble : IAsyncStartable, IDisposable
    {
        const int   PoolSize         = 12;
        const float DefaultDuration  = 2.5f;
        const float ScreenYOffsetPx  = 48f;
        const float BubbleSizePx     = 32f;
        const int   TickIntervalMs   = 16;

        readonly UIPanelManager _panelManager;
        readonly ISubscriber<SpeechBubbleMessage> _sub;

        readonly CompositeDisposable _disposables = new();

        VisualElement _container;
        BubbleSlot[] _pool;
        Camera _cam;

        [Inject]
        public DialogueBubble(UIPanelManager panelManager, ISubscriber<SpeechBubbleMessage> sub)
        {
            _panelManager = panelManager;
            _sub = sub;
        }

        public async UniTask StartAsync(CancellationToken cancellation)
        {
            var uiDoc = _panelManager.GetComponent<UIDocument>();
            if (uiDoc == null)
            {
                Debug.LogError("[DialogueBubble] UIPanelManager has no UIDocument");
                return;
            }

            int waited = 0;
            while (uiDoc.rootVisualElement == null && waited < 1000)
            {
                await UniTask.Delay(50, cancellationToken: cancellation);
                waited += 50;
            }
            if (uiDoc.rootVisualElement == null) return;

            BuildPool(uiDoc.rootVisualElement);

            var bag = MessagePipe.DisposableBag.CreateBuilder();
            _sub.Subscribe(OnBubbleMessage).AddTo(bag);
            _disposables.Add(bag.Build());

            _container.schedule.Execute(Tick).Every(TickIntervalMs);
        }

        void BuildPool(VisualElement root)
        {
            _container = new VisualElement();
            _container.style.position = Position.Absolute;
            _container.style.top = 0;
            _container.style.left = 0;
            _container.style.right = 0;
            _container.style.bottom = 0;
            _container.pickingMode = PickingMode.Ignore;
            root.Add(_container);

            _pool = new BubbleSlot[PoolSize];
            for (int i = 0; i < PoolSize; i++)
                _pool[i] = new BubbleSlot(_container);
        }

        void OnBubbleMessage(SpeechBubbleMessage msg)
        {
            if (msg.Emoji == BubbleEmoji.None || msg.Speaker == Entity.Null) return;
            var slot = AcquireSlot();
            float now = Time.unscaledTime;
            float dur = msg.Duration > 0f ? msg.Duration : DefaultDuration;
            slot.Show(msg.Speaker, EmojiGlyph(msg.Emoji), now + dur);
        }

        BubbleSlot AcquireSlot()
        {
            BubbleSlot oldest = null;
            float oldestExpiry = float.MaxValue;
            for (int i = 0; i < _pool.Length; i++)
            {
                if (!_pool[i].Active) return _pool[i];
                if (_pool[i].ExpiresAt < oldestExpiry)
                {
                    oldestExpiry = _pool[i].ExpiresAt;
                    oldest = _pool[i];
                }
            }
            return oldest;
        }

        void Tick()
        {
            if (_cam == null) _cam = Camera.main;
            if (_cam == null) return;

            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;

            float now = Time.unscaledTime;
            float screenH = Screen.height;

            for (int i = 0; i < _pool.Length; i++)
            {
                var slot = _pool[i];
                if (!slot.Active) continue;

                if (now >= slot.ExpiresAt) { slot.Hide(); continue; }

                if (!em.Exists(slot.Speaker) || !em.HasComponent<LocalTransform>(slot.Speaker))
                {
                    slot.Hide();
                    continue;
                }

                var t = em.GetComponentData<LocalTransform>(slot.Speaker);
                var screen = _cam.WorldToScreenPoint(new Vector3(t.Position.x, t.Position.y, 0f));
                if (screen.z < 0f) { slot.Hide(); continue; }

                float uiY = screenH - screen.y;
                slot.SetPosition(screen.x - BubbleSizePx * 0.5f, uiY - ScreenYOffsetPx - BubbleSizePx);
            }
        }

        static string EmojiGlyph(BubbleEmoji e) => e switch
        {
            BubbleEmoji.Wave     => "\ud83d\udc4b",
            BubbleEmoji.Alert    => "\u2757",
            BubbleEmoji.Sword    => "\u2694",
            BubbleEmoji.Food     => "\ud83c\udf56",
            BubbleEmoji.Sleep    => "\ud83d\udca4",
            BubbleEmoji.Question => "\u2753",
            BubbleEmoji.Heart    => "\u2764",
            BubbleEmoji.Skull    => "\ud83d\udc80",
            BubbleEmoji.Coin     => "\ud83d\udcb0",
            _ => "•",
        };

        public void Dispose() => _disposables?.Dispose();

        sealed class BubbleSlot
        {
            VisualElement _root;
            Label _label;
            public Entity Speaker;
            public float  ExpiresAt;
            public bool   Active;

            public BubbleSlot(VisualElement parent)
            {
                _root = new VisualElement();
                _root.style.position = Position.Absolute;
                _root.style.width = BubbleSizePx;
                _root.style.height = BubbleSizePx;
                _root.style.backgroundColor = UIStyles.Palette.Zinc900;
                _root.style.BorderColor(UIStyles.Palette.BorderGold);
                _root.style.BorderWidth(1f);
                _root.style.alignItems = Align.Center;
                _root.style.justifyContent = Justify.Center;
                _root.pickingMode = PickingMode.Ignore;
                _root.style.display = DisplayStyle.None;

                _label = new Label();
                _label.style.color = UIStyles.Palette.GoldBright;
                _label.style.fontSize = 18;
                _label.pickingMode = PickingMode.Ignore;
                _root.Add(_label);

                parent.Add(_root);
            }

            public void Show(Entity speaker, string glyph, float expiresAt)
            {
                _label.text = glyph;
                Speaker = speaker;
                ExpiresAt = expiresAt;
                Active = true;
                _root.style.display = DisplayStyle.Flex;
            }

            public void Hide()
            {
                Active = false;
                ExpiresAt = 0f;
                Speaker = Entity.Null;
                _root.style.display = DisplayStyle.None;
            }

            public void SetPosition(float left, float top)
            {
                _root.style.left = left;
                _root.style.top = top;
            }
        }
    }
}
