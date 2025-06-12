using UnityEngine;
using UnityEngine.UI;
using TMPro;
using R3;
using KBVE.MMExtensions.Orchestrator.Health;
using System;
using VContainer;
using VContainer.Unity;
using Cysharp.Threading.Tasks;
using KBVE.MMExtensions.Orchestrator.Interfaces;

namespace KBVE.MMExtensions.Orchestrator.Core.UI
{
    public class UIContainerStats : MonoBehaviour, IDisposable, IAsyncStartable
    {

        private readonly CompositeDisposable _subscription = new();
        private readonly ReactiveProperty<bool> _isUIVisible = new(true);
        private CancellationTokenSource _cts;

        private IGlobalCanvas _globalCanvas;
        private IHUDService _hudService;

        [Inject]
        public void Construct(IGlobalCanvas canvas, IHUDService hudService)
        {
            _globalCanvas = canvas;
            _hudService = hudService;
        }

        private GameObject _panel1;
        private GameObject _panel2;

        public async UniTask StartAsync(CancellationToken cancellation = default)
        {
            _cts = new CancellationTokenSource();
            var linkedToken = CancellationTokenSource.CreateLinkedTokenSource(_cts.Token, cancellation).Token;
            await UniTask.WaitUntil(() => _globalCanvas?.Canvas != null
            && _hudService?.HUDPanel != null, cancellationToken: linkedToken);
            await Operator.R();

            _panel1 = new GameObject("StatBarsPanel", typeof(RectTransform), typeof(VerticalLayoutGroup));
            _panel1.transform.SetParent(_hudService.HUDPanel.transform, false);
            ConfigurePanelLayout(_panel1.GetComponent<VerticalLayoutGroup>());

            _panel2 = new GameObject("StatAttributesPanel", typeof(RectTransform), typeof(VerticalLayoutGroup));
            _panel2.transform.SetParent(_hudService.HUDPanel.transform, false);
            ConfigurePanelLayout(_panel2.GetComponent<VerticalLayoutGroup>());


            _isUIVisible.Subscribe(isVisible =>
            {
                _panel1.SetActive(isVisible);
                _panel2.SetActive(isVisible);
            }).AddTo(_subscription);

            //await UniTask.Yield(linkedToken);
        }

        private void ConfigurePanelLayout(VerticalLayoutGroup layout)
        {
            layout.spacing = 6f;
            layout.childAlignment = TextAnchor.UpperLeft;
            layout.childControlHeight = true;
            layout.childControlWidth = true;
            layout.childForceExpandHeight = false;
            layout.childForceExpandWidth = false;

            var fitter = layout.gameObject.AddComponent<ContentSizeFitter>();
            fitter.verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            fitter.horizontalFit = ContentSizeFitter.FitMode.Unconstrained;

            var rect = layout.GetComponent<RectTransform>();
            rect.pivot = new Vector2(0f, 1f);
            rect.anchorMin = new Vector2(0f, 1f);
            rect.anchorMax = new Vector2(0f, 1f);
            rect.anchoredPosition = Vector2.zero;
        }

        public void Dispose()
        {
            _cts?.Cancel();
            _cts?.Dispose();
            _subscription?.Dispose();
            _cts = null;
        }
        private void OnDestroy()
        {
            Dispose();
        }
    }


}