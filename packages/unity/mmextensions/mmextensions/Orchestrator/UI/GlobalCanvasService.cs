using UnityEngine;
using UnityEngine.UI;
using Cysharp.Threading.Tasks;
using System;
using System.Collections.Generic;
using System.Threading;
using VContainer;
using VContainer.Unity;
using KBVE.MMExtensions.Orchestrator.Core;
using KBVE.MMExtensions.Orchestrator.Interfaces;
using R3;
using ObservableCollections;


namespace KBVE.MMExtensions.Orchestrator.Core.UI
{
    public class GlobalCanvasService : MonoBehaviour, IGlobalCanvas, IAsyncStartable, IDisposable
    {
        public Canvas Canvas { get; private set; }
        public Transform Root => _canvasGO?.transform;
        public ObservableList<GameObject> ToastPanels { get; } = new();
        public ObservableList<GameObject> ModalPanels { get; } = new();
        public ObservableList<GameObject> TooltipPanels { get; } = new();
        private GameObject _canvasGO;
        private readonly Dictionary<UICanvasLayer, Transform> _layerRoots = new();

        public ReactiveProperty<bool> IsReady { get; } = new(false);

        private void Awake()
        {
            _canvasGO = this.gameObject;

            if (!_canvasGO.TryGetComponent(out Canvas canvas))
                canvas = _canvasGO.AddComponent<Canvas>();
            Canvas = canvas;

            if (!_canvasGO.TryGetComponent(out CanvasScaler scaler))
                scaler = _canvasGO.AddComponent<CanvasScaler>();

            if (!_canvasGO.TryGetComponent(out GraphicRaycaster raycaster))
                raycaster = _canvasGO.AddComponent<GraphicRaycaster>();
        }

        public async UniTask StartAsync(CancellationToken cancellation)
        {
            await UniTask.NextFrame(cancellation);

            _canvasGO = this.gameObject;
            // _canvasGO.name = "GlobalUICanvas";

            Canvas = _canvasGO.GetComponent<Canvas>() ?? _canvasGO.AddComponent<Canvas>();
            var scaler = _canvasGO.GetComponent<CanvasScaler>() ?? _canvasGO.AddComponent<CanvasScaler>();
            var raycaster = _canvasGO.GetComponent<GraphicRaycaster>() ?? _canvasGO.AddComponent<GraphicRaycaster>();

            Canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            Canvas.sortingOrder = 1000;

            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);
            scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            scaler.matchWidthOrHeight = 0.5f;

            DontDestroyOnLoad(_canvasGO);

            foreach (UICanvasLayer layer in Enum.GetValues(typeof(UICanvasLayer)))
            {
                var layerGO = new GameObject(layer.ToString() + "Layer", typeof(RectTransform));
                layerGO.transform.SetParent(_canvasGO.transform, false);

                var rect = layerGO.GetComponent<RectTransform>();
                rect.anchorMin = Vector2.zero;
                rect.anchorMax = Vector2.one;
                rect.offsetMin = Vector2.zero;
                rect.offsetMax = Vector2.zero;
                rect.pivot = new Vector2(0.5f, 0.5f);

                _layerRoots[layer] = rect;
            }

            IsReady.Value = true;
            Debug.Log("[GlobalCanvasService] Ready.");
        }


        public Transform GetLayerRoot(UICanvasLayer layer)
        {
            if (_layerRoots.TryGetValue(layer, out var root))
                return root;

            Debug.LogWarning($"[GlobalCanvasService] Requested root for '{layer}' but none exists. Returning base Root.");
            return Root;
        }

        public GameObject SpawnPanel(GameObject prefab, UICanvasLayer layer)
        {

            if (prefab == null)
            {
                Debug.LogWarning("[GlobalCanvasService] Tried to spawn a null panel.");
                return null;
            }

            var go = Instantiate(prefab, GetLayerRoot(layer));
            switch (layer)
            {
                case UICanvasLayer.Toast:
                    ToastPanels.Add(go);
                    break;
                case UICanvasLayer.Modal:
                    ModalPanels.Add(go);
                    break;
                case UICanvasLayer.Tooltip:
                    TooltipPanels.Add(go);
                    break;
                default:
                    Debug.LogWarning($"[GlobalCanvasService] SpawnPanel: Unhandled layer '{layer}'. Not added to any list.");
                    break;
            }

            return go;
        }

        public void RemovePanel(GameObject panel, UICanvasLayer layer)
        {
            if (panel == null)
            {
                Debug.LogWarning("[GlobalCanvasService] Tried to remove a null panel.");
                return;
            }

            switch (layer)
            {
                case UICanvasLayer.Toast:
                    ToastPanels.Remove(panel);
                    break;
                case UICanvasLayer.Modal:
                    ModalPanels.Remove(panel);
                    break;
                case UICanvasLayer.Tooltip:
                    TooltipPanels.Remove(panel);
                    break;
                default:
                    Debug.LogWarning($"[GlobalCanvasService] RemovePanel: Unhandled layer '{layer}'. Could not remove panel.");
                    break;
            }

            Destroy(panel);
        }

        public void Dispose()
        {
            if (_canvasGO != null)
            {
                Destroy(_canvasGO);
                _canvasGO = null;
                Canvas = null;
            }

            ToastPanels.Clear();
            ModalPanels.Clear();
            TooltipPanels.Clear();

            IsReady.Dispose();
        }
    }
}