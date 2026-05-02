using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using R3;
using UnityEngine.UIElements;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Settings panel — sidebar tabs + per-tab body. Chrome in Resources/UI/Settings.uxml; first tab is world Search.</summary>
    public class UISettings : IAsyncStartable, IDisposable
    {
        readonly UIPanelManager _panelManager;

        readonly CompositeDisposable _disposables = new();
        readonly ReactiveProperty<bool> _isOpen = new(false);
        public ReadOnlyReactiveProperty<bool> IsOpen => _isOpen;

        readonly ISettingsTab[] _tabs;
        Button[] _tabButtons;
        VisualElement[] _tabBodies;
        int _activeIndex;

        VisualElement _root, _panel, _sidebar, _content;

        [Inject]
        public UISettings(UIPanelManager panelManager,
                          LocaleService locale,
                          CameraService camera,
                          BiomeGenerator biomes,
                          WorldGenSession session)
        {
            _panelManager = panelManager;
            _tabs = new ISettingsTab[]
            {
                new SearchTab(locale, camera, biomes),
                new SaveSlotsTab(locale, session),
                new SystemTab(locale, session),
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

            _root = UIPanelLoader.Load(uiDoc, "UI/Settings");
            if (_root == null) return;

            var wrapper  = _root.Q<VisualElement>("settings-wrapper");
            _panel       = wrapper;
            var card     = _root.Q<VisualElement>("settings-root");
            var backdrop = _root.Q<VisualElement>("settings-backdrop");
            _sidebar     = _root.Q<VisualElement>("settings-sidebar");
            _content     = _root.Q<VisualElement>("settings-content");
            _root.Q<Button>("settings-close").clicked += Close;
            backdrop.RegisterCallback<ClickEvent>(_ => Close());
            card.RegisterCallback<ClickEvent>(e => e.StopPropagation());

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
                if (open) { _panel.RemoveFromClassList("is-hidden"); _root.BringToFront(); }
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
            _isOpen?.Dispose();
        }
    }
}
