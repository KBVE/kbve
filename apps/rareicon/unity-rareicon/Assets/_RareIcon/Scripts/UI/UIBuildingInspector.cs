using System;
using System.Threading;
using Cysharp.Text;
using Cysharp.Threading.Tasks;
using MessagePipe;
using R3;
using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;
using UnityEngine.UIElements;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>
    /// Bottom-left panel that displays the building the player just
    /// clicked. Subscribed to <see cref="BuildingInspectMessage"/> from
    /// the click router (<see cref="AppStateController"/>) so opening is
    /// purely message-driven — clicking another building swaps the
    /// inspected entity, clicking empty hex / a unit leaves it untouched.
    ///
    /// Sections shown (skipped when the building doesn't carry the
    /// component): name + owner header, production line with cycle
    /// progress, storage list. Polls every 500ms while open so the
    /// production countdown ticks live.
    /// </summary>
    public class UIBuildingInspector : IAsyncStartable, IDisposable
    {
        const int RefreshIntervalMs = 500;

        readonly LocaleService _locale;
        readonly UIPanelManager _panelManager;
        readonly ISubscriber<BuildingInspectMessage> _inspectSub;

        readonly CompositeDisposable _disposables = new();
        readonly ReactiveProperty<bool> _isOpen = new(false);
        public ReadOnlyReactiveProperty<bool> IsOpen => _isOpen;

        VisualElement _root;
        Label _titleLabel;
        Label _ownerLabel;
        Label _productionLabel;
        Label _storageLabel;
        IVisualElementScheduledItem _refreshTick;
        Entity _target;

        [Inject]
        public UIBuildingInspector(
            LocaleService locale,
            UIPanelManager panelManager,
            ISubscriber<BuildingInspectMessage> inspectSub)
        {
            _locale       = locale;
            _panelManager = panelManager;
            _inspectSub   = inspectSub;
        }

        public async UniTask StartAsync(CancellationToken cancellation)
        {
            var uiDoc = _panelManager.GetComponent<UIDocument>();
            if (uiDoc == null)
            {
                Debug.LogError("[UIBuildingInspector] UIPanelManager has no UIDocument");
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
                Debug.LogError("[UIBuildingInspector] rootVisualElement still null");
                return;
            }

            BuildUI(uiDoc.rootVisualElement);

            var bag = MessagePipe.DisposableBag.CreateBuilder();
            _inspectSub.Subscribe(OnInspect).AddTo(bag);
            _disposables.Add(bag.Build());

            _isOpen
                .Subscribe(open =>
                {
                    _root.style.display = open ? DisplayStyle.Flex : DisplayStyle.None;
                    if (open)
                    {
                        Refresh();
                        _refreshTick = _root.schedule.Execute(Refresh).Every(RefreshIntervalMs);
                    }
                    else
                    {
                        _refreshTick?.Pause();
                        _refreshTick = null;
                    }
                })
                .AddTo(_disposables);
        }

        public void Close() => _isOpen.Value = false;

        void OnInspect(BuildingInspectMessage msg)
        {
            // Click router only fires this for building hexes — defensive
            // null check anyway in case the entity got destroyed between
            // click and dispatch.
            if (msg.Building == Entity.Null) return;
            _target = msg.Building;
            _isOpen.Value = true;
            Refresh();
        }

        void BuildUI(VisualElement parent)
        {
            // Bottom-left so it doesn't collide with the right-side
            // Treasury / Build palette stack or the bottom-right hover
            // panel. Width matches Treasury for visual consistency.
            _root = new VisualElement().ApplyPanelChrome(padV: 12, padH: 14);
            _root.style.AnchorBottomLeft();
            _root.style.width = 280;
            _root.style.display = DisplayStyle.None;
            _root.RegisterCallback<ClickEvent>(e => e.StopPropagation());

            var header = new VisualElement();
            header.style.flexDirection = FlexDirection.Row;
            header.style.justifyContent = Justify.SpaceBetween;
            header.style.alignItems = Align.Center;
            header.style.marginBottom = 8;

            _titleLabel = UIStyles.MakeMarkerRow(_locale.Get("inspector.title"), fontSize: 16);
            header.Add(_titleLabel);

            var closeBtn = UIStyles.MakeYorhaButton("\u00D7", Close);
            closeBtn.style.width = 24;
            closeBtn.style.height = 24;
            closeBtn.style.Padding(0);
            closeBtn.style.fontSize = 16;
            header.Add(closeBtn);

            _root.Add(header);
            _root.Add(UIStyles.MakeStrip());

            _ownerLabel = MakeBodyLabel(UIStyles.Palette.TextMuted, 12);
            _ownerLabel.style.marginBottom = 4;
            _root.Add(_ownerLabel);

            _productionLabel = MakeBodyLabel(UIStyles.Palette.TextStrong, 13);
            _productionLabel.style.marginBottom = 4;
            _root.Add(_productionLabel);

            _storageLabel = MakeBodyLabel(UIStyles.Palette.TextStrong, 13);
            _root.Add(_storageLabel);

            parent.Add(_root);
        }

        static Label MakeBodyLabel(Color color, int fontSize)
        {
            var l = new Label(string.Empty);
            l.style.color = color;
            l.style.fontSize = fontSize;
            l.style.whiteSpace = WhiteSpace.Normal;
            return l;
        }

        void Refresh()
        {
            if (_titleLabel == null) return;
            if (_target == Entity.Null) return;

            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;

            // Building was destroyed between open and refresh — collapse
            // to a graceful empty state and close on next tick.
            if (!em.Exists(_target) || !em.HasComponent<Building>(_target))
            {
                _isOpen.Value = false;
                _target = Entity.Null;
                return;
            }

            var b = em.GetComponentData<Building>(_target);

            _titleLabel.text = _locale.Get(BuildingDB.GetLocaleKey(b.Type));

            var ownerSb = ZString.CreateStringBuilder();
            try
            {
                ownerSb.Append(_locale.Get("inspector.owner"));
                ownerSb.Append(": ");
                ownerSb.Append(_locale.GetFactionName(b.OwnerFaction));
                ownerSb.Append("  \u2022  ");
                ownerSb.Append(_locale.Get("hex.coord"));
                ownerSb.Append(' ');
                ownerSb.Append('(');
                ownerSb.Append(b.RootHex.x);
                ownerSb.Append(", ");
                ownerSb.Append(b.RootHex.y);
                ownerSb.Append(')');
                _ownerLabel.text = ownerSb.ToString();
            }
            finally { ownerSb.Dispose(); }

            float now = TryGetClockSeconds(em);

            RefreshProduction(em, now);
            RefreshStorage(em);
        }

        // Each production component carries CycleEndsAt + CycleDuration
        // anchored to WorldClock.AbsSeconds. Show the most informative
        // line we can — only one production component per building so
        // the order of checks is mutually exclusive in practice.
        void RefreshProduction(EntityManager em, float now)
        {
            var sb = ZString.CreateStringBuilder();
            try
            {
                if (em.HasComponent<FarmProduction>(_target))
                {
                    var p = em.GetComponentData<FarmProduction>(_target);
                    AppendProductionHeader(ref sb);
                    AppendRecipe(ref sb,
                        p.InputItemId, p.InputAmount,
                        p.OutputItemId, p.OutputAmount);
                    AppendCycle(ref sb, p.CycleEndsAt, p.CycleDuration, now);
                    if (p.TenderBonus > 0f)
                    {
                        sb.Append("\n");
                        sb.Append(_locale.Get("inspector.tender_bonus"));
                        sb.Append(": +");
                        sb.Append((int)Mathf.Round(p.TenderBonus * 100f));
                        sb.Append('%');
                    }
                }
                else if (em.HasComponent<FurnaceProduction>(_target))
                {
                    var p = em.GetComponentData<FurnaceProduction>(_target);
                    AppendProductionHeader(ref sb);
                    AppendInputs(ref sb,
                        p.Input1Id, p.Input1Amount,
                        p.Input2Id, p.Input2Amount,
                        0, 0);
                    sb.Append(" \u2192 ");
                    AppendOutputs(ref sb,
                        p.Output1Id, p.Output1Amount,
                        p.Output2Id, p.Output2Amount,
                        p.Output3Id, p.Output3Amount);
                    AppendCycle(ref sb, p.CycleEndsAt, p.CycleDuration, now);
                }
                else if (em.HasComponent<CapitalProduction>(_target))
                {
                    var p = em.GetComponentData<CapitalProduction>(_target);
                    AppendProductionHeader(ref sb);
                    AppendInputs(ref sb,
                        p.Input1Id, p.Input1Amount,
                        p.Input2Id, p.Input2Amount,
                        p.Input3Id, p.Input3Amount);
                    sb.Append(" \u2192 ");
                    AppendOutputs(ref sb,
                        p.OutputId, p.OutputAmount,
                        0, 0,
                        0, 0);
                    AppendCycle(ref sb, p.CycleEndsAt, p.CycleDuration, now);
                }
                else if (em.HasComponent<PassiveProduction>(_target))
                {
                    var p = em.GetComponentData<PassiveProduction>(_target);
                    AppendProductionHeader(ref sb);
                    sb.Append("\u2192 ");
                    AppendItemQty(ref sb, p.OutputId, p.OutputAmount);
                    AppendCycle(ref sb, p.CycleEndsAt, p.CycleDuration, now);
                }

                if (sb.Length == 0)
                {
                    _productionLabel.style.display = DisplayStyle.None;
                    _productionLabel.text = string.Empty;
                }
                else
                {
                    _productionLabel.style.display = DisplayStyle.Flex;
                    _productionLabel.text = sb.ToString();
                }
            }
            finally { sb.Dispose(); }
        }

        void AppendProductionHeader(ref Utf16ValueStringBuilder sb)
        {
            sb.Append(_locale.Get("inspector.production"));
            sb.Append('\n');
        }

        void AppendRecipe(ref Utf16ValueStringBuilder sb,
                          ushort inItem, ushort inAmt,
                          ushort outItem, ushort outAmt)
        {
            AppendItemQty(ref sb, inItem, inAmt);
            sb.Append(" \u2192 ");
            AppendItemQty(ref sb, outItem, outAmt);
        }

        void AppendInputs(ref Utf16ValueStringBuilder sb,
                          ushort i1, ushort a1,
                          ushort i2, ushort a2,
                          ushort i3, ushort a3)
        {
            bool any = false;
            if (a1 > 0) { AppendItemQty(ref sb, i1, a1); any = true; }
            if (a2 > 0) { if (any) sb.Append(" + "); AppendItemQty(ref sb, i2, a2); any = true; }
            if (a3 > 0) { if (any) sb.Append(" + "); AppendItemQty(ref sb, i3, a3); }
        }

        void AppendOutputs(ref Utf16ValueStringBuilder sb,
                           ushort o1, ushort a1,
                           ushort o2, ushort a2,
                           ushort o3, ushort a3)
        {
            bool any = false;
            if (a1 > 0) { AppendItemQty(ref sb, o1, a1); any = true; }
            if (a2 > 0) { if (any) sb.Append(" + "); AppendItemQty(ref sb, o2, a2); any = true; }
            if (a3 > 0) { if (any) sb.Append(" + "); AppendItemQty(ref sb, o3, a3); }
        }

        void AppendItemQty(ref Utf16ValueStringBuilder sb, ushort itemId, ushort amount)
        {
            sb.Append(amount);
            sb.Append(' ');
            sb.Append(_locale.GetItemName(itemId));
        }

        // Cycle bar is text-only for v1: "Cycle 14s / 30s" or "Idle".
        // CycleEndsAt == 0 (or duration == 0) means the system hasn't
        // armed it yet — show idle so the player knows the building is
        // alive but waiting on inputs.
        void AppendCycle(ref Utf16ValueStringBuilder sb,
                         float cycleEndsAt, float duration, float now)
        {
            sb.Append('\n');
            if (cycleEndsAt <= 0f || duration <= 0f)
            {
                sb.Append(_locale.Get("inspector.idle"));
                return;
            }

            float remaining = math.max(0f, cycleEndsAt - now);
            float elapsed   = math.max(0f, duration - remaining);
            sb.Append(_locale.Get("inspector.cycle"));
            sb.Append(' ');
            sb.Append((int)Mathf.Round(elapsed));
            sb.Append("s / ");
            sb.Append((int)Mathf.Round(duration));
            sb.Append('s');
        }

        void RefreshStorage(EntityManager em)
        {
            if (!em.HasBuffer<InventorySlot>(_target))
            {
                _storageLabel.style.display = DisplayStyle.None;
                _storageLabel.text = string.Empty;
                return;
            }

            var slots = em.GetBuffer<InventorySlot>(_target);
            var sb = ZString.CreateStringBuilder();
            try
            {
                sb.Append(_locale.Get("inspector.storage"));
                sb.Append('\n');
                int written = 0;
                for (int i = 0; i < slots.Length; i++)
                {
                    var s = slots[i];
                    if (s.ItemId == 0 || s.Count == 0) continue;
                    if (written > 0) sb.Append('\n');
                    sb.Append(_locale.GetItemName(s.ItemId));
                    sb.Append(" \u00D7 ");
                    sb.Append(s.Count);
                    written++;
                }
                if (written == 0)
                {
                    sb.Append(_locale.Get("inspector.empty"));
                }
                _storageLabel.style.display = DisplayStyle.Flex;
                _storageLabel.text = sb.ToString();
            }
            finally { sb.Dispose(); }
        }

        static float TryGetClockSeconds(EntityManager em)
        {
            using var q = em.CreateEntityQuery(ComponentType.ReadOnly<WorldClock>());
            return q.CalculateEntityCount() == 0 ? 0f : q.GetSingleton<WorldClock>().AbsSeconds;
        }

        public void Dispose()
        {
            _refreshTick?.Pause();
            _refreshTick = null;
            _disposables?.Dispose();
        }
    }
}
