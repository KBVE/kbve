using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using MessagePipe;
using R3;
using UnityEngine.UIElements;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Citizens panel — sidebar tabs + per-tab body. Chrome in Resources/UI/Citizens.uxml; the controller just wires tabs into the template's sidebar / content host.</summary>
    public class UICitizensPanel : IAsyncStartable, IDisposable
    {
        readonly UIPanelManager _panelManager;
        readonly LocaleService _locale;

        readonly CompositeDisposable _disposables = new();
        readonly ReactiveProperty<bool> _isOpen = new(false);
        public ReadOnlyReactiveProperty<bool> IsOpen => _isOpen;

        readonly ICitizensTab[] _tabs;
        Button[] _tabButtons;
        VisualElement[] _tabBodies;
        int _activeIndex;

        VisualElement _root, _panel, _sidebar, _content;

        [Inject]
        public UICitizensPanel(UIPanelManager panelManager,
                               LocaleService locale,
                               ActivityFeedService activity,
                               CameraService camera,
                               IPublisher<PossessUnitMessage> possessPub)
        {
            _panelManager = panelManager;
            _locale = locale;
            _tabs = new ICitizensTab[]
            {
                new JobsTab(),
                new RosterTab(locale, activity, camera, possessPub),
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

            _root = UIPanelLoader.Load(uiDoc, "UI/Citizens");
            if (_root == null) return;

            _panel   = _root.Q<VisualElement>("citizens-root");
            _sidebar = _root.Q<VisualElement>("citizens-sidebar");
            _content = _root.Q<VisualElement>("citizens-content");
            _root.Q<Label>("citizens-title").text = "Citizens";
            _root.Q<Button>("citizens-close").clicked += Close;

            _tabButtons = new Button[_tabs.Length];
            _tabBodies  = new VisualElement[_tabs.Length];
            for (int i = 0; i < _tabs.Length; i++)
            {
                int captured = i;
                _tabButtons[i] = UIControls.MakeSidebarTab(
                    _tabs[i].Title, isActive: i == 0, onClick: () => SelectTab(captured));
                _sidebar.Add(_tabButtons[i]);

                _tabBodies[i] = _tabs[i].Build();
                _tabBodies[i].style.display = i == 0 ? DisplayStyle.Flex : DisplayStyle.None;
                _content.Add(_tabBodies[i]);
            }
            _activeIndex = 0;

            _isOpen.Subscribe(open =>
            {
                if (open) _panel.RemoveFromClassList("is-hidden");
                else      _panel.AddToClassList("is-hidden");
                if (open) _tabs[_activeIndex].OnActivated();
            }).AddTo(_disposables);
        }

        public void Toggle() => _isOpen.Value = !_isOpen.Value;
        public void Close()  => _isOpen.Value = false;

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
