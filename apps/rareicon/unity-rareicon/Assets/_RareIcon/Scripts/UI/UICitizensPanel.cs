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
    /// <summary>Top-right population management panel with a vertical sidebar of tabs (Jobs, Roster, ...); each tab is a self-contained ICitizensTab.</summary>
    public class UICitizensPanel : IAsyncStartable, IDisposable
    {
        readonly UIPanelManager _panelManager;

        readonly CompositeDisposable _disposables = new();
        readonly ReactiveProperty<bool> _isOpen = new(false);
        public ReadOnlyReactiveProperty<bool> IsOpen => _isOpen;

        readonly ICitizensTab[] _tabs;
        Button[] _tabButtons;
        VisualElement[] _tabBodies;
        int _activeIndex;

        VisualElement _root;
        VisualElement _content;

        [Inject]
        public UICitizensPanel(UIPanelManager panelManager, LocaleService locale)
        {
            _panelManager = panelManager;
            _tabs = new ICitizensTab[]
            {
                new JobsTab(),
                new RosterTab(),
                new SkillsTab(),
                new DietTab(locale),
            };
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

            BuildUI(uiDoc.rootVisualElement);

            _isOpen
                .Subscribe(open =>
                {
                    _root.style.display = open ? DisplayStyle.Flex : DisplayStyle.None;
                    if (open) _tabs[_activeIndex].OnActivated();
                })
                .AddTo(_disposables);
        }

        public void Toggle() => _isOpen.Value = !_isOpen.Value;
        public void Close()  => _isOpen.Value = false;

        void BuildUI(VisualElement parent)
        {
            _root = new VisualElement().ApplyPanelChrome(padV: 12, padH: 14);
            _root.style.position = Position.Absolute;
            _root.style.top = new Length(2f, LengthUnit.Percent);
            _root.style.right = new Length(2f, LengthUnit.Percent);
            _root.style.marginTop = 70;
            _root.style.width = 420;
            _root.style.display = DisplayStyle.None;

            var header = new VisualElement();
            header.style.flexDirection = FlexDirection.Row;
            header.style.justifyContent = Justify.SpaceBetween;
            header.style.alignItems = Align.Center;
            header.style.marginBottom = 8;
            header.Add(UIStyles.MakeMarkerRow("Citizens", fontSize: 16));
            var closeBtn = UIStyles.MakeYorhaButton("\u00D7", Close);
            closeBtn.style.width = 24;
            closeBtn.style.height = 24;
            closeBtn.style.fontSize = 16;
            header.Add(closeBtn);
            _root.Add(header);
            _root.Add(UIStyles.MakeStrip());

            var body = UIControls.MakeTabbedLayout(out var sidebar, out _content);
            body.style.marginTop = 8;
            _root.Add(body);

            _tabButtons = new Button[_tabs.Length];
            _tabBodies  = new VisualElement[_tabs.Length];
            for (int i = 0; i < _tabs.Length; i++)
            {
                int captured = i;
                _tabButtons[i] = UIControls.MakeSidebarTab(
                    _tabs[i].Title, isActive: i == 0, onClick: () => SelectTab(captured));
                sidebar.Add(_tabButtons[i]);

                _tabBodies[i] = _tabs[i].Build();
                _tabBodies[i].style.display = i == 0 ? DisplayStyle.Flex : DisplayStyle.None;
                _content.Add(_tabBodies[i]);
            }

            parent.Add(_root);
            _activeIndex = 0;
        }

        void SelectTab(int index)
        {
            if (index == _activeIndex) return;
            for (int i = 0; i < _tabs.Length; i++)
            {
                UIControls.ApplySidebarTabActive(_tabButtons[i], i == index);
                _tabBodies[i].style.display = i == index ? DisplayStyle.Flex : DisplayStyle.None;
            }
            _activeIndex = index;
            _tabs[index].OnActivated();
        }

        public void Dispose()
        {
            for (int i = 0; i < _tabs.Length; i++) _tabs[i].Dispose();
            _disposables?.Dispose();
        }
    }
}
