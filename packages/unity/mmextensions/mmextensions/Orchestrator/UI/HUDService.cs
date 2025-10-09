using System;
using System.Collections.Generic;
using System.Threading;
using Cysharp.Threading.Tasks;
using UnityEngine;
using UnityEngine.UI;
using VContainer;
using VContainer.Unity;
using R3;
using ObservableCollections;
using KBVE.MMExtensions.Orchestrator.Health;
using KBVE.MMExtensions.Orchestrator.Interfaces;
using TMPro;


namespace KBVE.MMExtensions.Orchestrator.Core.UI
{
    public class HUDService : MonoBehaviour, IHUDService, IAsyncStartable, IDisposable
    {
        public ObservableList<StatObservable> ReactiveStats { get; } = new();

        public GameObject HUDPanel => _panelGO;
        private readonly Dictionary<StatType, StatObservable> _lookup = new();
        private readonly Dictionary<StatType, StatBar> _barPool = new();
        private readonly Dictionary<StatType, StatDisplay> _displayPool = new();


        private RectTransform _panelRect;
        private GameObject _panelGO;
        private IGlobalCanvas _globalCanvas;
        private CancellationTokenSource _switchCts;

        [Inject]
        public void Construct(IGlobalCanvas canvas)
        {
            _globalCanvas = canvas;
        }

        public async UniTask StartAsync(CancellationToken cancellation)
        {
            await UniTask.NextFrame(cancellation);
            await UniTask.WaitUntil(() => _globalCanvas?.Canvas != null, cancellationToken: cancellation);

            if (_globalCanvas is GlobalCanvasService canvasService)
                await UniTask.WaitUntil(() => canvasService.IsReady.Value, cancellationToken: cancellation);

            var tempHUDPanel = CreateHUDPanel();
            _panelGO = _globalCanvas.SpawnPanel(tempHUDPanel, UICanvasLayer.HUD);
            _panelRect = _panelGO.GetComponent<RectTransform>();
            _ = DestroyLaterSafe(tempHUDPanel);
            Debug.Log("[HUDService] Initialized.");
        }

        public async UniTask SetActiveStatsAsync(Dictionary<StatType, StatData> statMap)
        {
            _switchCts?.Cancel();
            _switchCts = new CancellationTokenSource();
            var token = _switchCts.Token;

            await UniTask.Delay(50, cancellationToken: token);

            ReactiveStats.Clear();
            _lookup.Clear();

            int barIndex = 0;

            foreach (var (type, data) in statMap)
            {
                var view = new StatObservable { Type = type };
                view.UpdateFrom(data);
                view.Bind(() => statMap[type]);

                ReactiveStats.Add(view);
                _lookup[type] = view;

                if (StatHelper.IsRegenerating(type))
                {
                    if (!_barPool.TryGetValue(type, out var bar))
                    {
                        bar = CreateStatBar(view, _panelRect, barIndex);
                        _barPool[type] = bar;
                    }

                    bar.gameObject.SetActive(true);
                    bar.Bind(view);
                    SetBarPosition(bar, barIndex);
                }
                else
                {
                    if (!_displayPool.TryGetValue(type, out var display))
                    {
                        display = CreateStatDisplay(view, _panelRect, barIndex);
                        _displayPool[type] = display;
                    }

                    display.gameObject.SetActive(true);
                    display.Bind(view);
                    SetBarPosition(display, barIndex);
                }

                barIndex++;
            }

            foreach (var kvp in _barPool)
            {
                if (!_lookup.ContainsKey(kvp.Key))
                    kvp.Value.gameObject.SetActive(false);
            }

            foreach (var kvp in _displayPool)
            {
                if (!_lookup.ContainsKey(kvp.Key))
                    kvp.Value.gameObject.SetActive(false);
            }
        }

        public void UpdateStat(StatType type, StatData data)
        {
            if (_lookup.TryGetValue(type, out var view))
                view.UpdateFrom(data);
        }

        public StatObservable GetObservable(StatType type)
        {
            _lookup.TryGetValue(type, out var stat);
            return stat;
        }

        public void ClearStats()
        {
            ReactiveStats.Clear();
            _lookup.Clear();

            foreach (var bar in _barPool.Values)
                bar.gameObject.SetActive(false);
        }

        private GameObject CreateHUDPanel()
        {
            var panel = new GameObject("HUDPanel", typeof(RectTransform), typeof(CanvasGroup));

            var rect = panel.GetComponent<RectTransform>();
            rect.anchorMin = new Vector2(0.5f, 1f);
            rect.anchorMax = new Vector2(0.5f, 1f);
            rect.pivot = new Vector2(0.5f, 1f);
            rect.anchoredPosition = new Vector2(0f, -50f);
            rect.sizeDelta = new Vector2(600f, 300f);

            return panel;
        }

        private void SetBarPosition(Component bar, int index)
        {
            var rt = bar.GetComponent<RectTransform>();
            rt.anchoredPosition = new Vector2(0f, -(index * 30f));
        }

        private StatBar CreateStatBar(StatObservable stat, Transform parent, int index)
        {
            var go = new GameObject($"{stat.Type}Bar", typeof(RectTransform), typeof(StatBar));
            var rt = go.GetComponent<RectTransform>();
            rt.sizeDelta = new Vector2(260, 24);
            rt.anchorMin = new Vector2(0.5f, 1f);
            rt.anchorMax = new Vector2(0.5f, 1f);
            rt.pivot = new Vector2(0.5f, 1f);
            go.transform.SetParent(parent, false);
            var bar = go.GetComponent<StatBar>();

            SetBarPosition(bar, index);

            // Background
            var background = new GameObject("Background", typeof(Image));
            background.transform.SetParent(go.transform, false);
            var bgImage = background.GetComponent<Image>();
            bgImage.color = new Color(0f, 0f, 0f, 0.6f);
            var bgRT = background.GetComponent<RectTransform>();
            bgRT.anchorMin = Vector2.zero;
            bgRT.anchorMax = Vector2.one;
            bgRT.offsetMin = bgRT.offsetMax = Vector2.zero;

            // Fill
            var fill = new GameObject("Fill", typeof(Image));
            fill.transform.SetParent(background.transform, false);
            var fillImage = fill.GetComponent<Image>();
            fillImage.color = new Color(0.2f, 0.6f, 1f);
            fillImage.type = Image.Type.Filled;
            fillImage.fillMethod = Image.FillMethod.Horizontal;
            fillImage.fillAmount = 1f;
            // Assign default white sprite for proper fill rendering
            // fillImage.sprite = Resources.GetBuiltinResource<Sprite>("UI/Skin/UISprite"); // Built-in sprite not available
            var fillRT = fill.GetComponent<RectTransform>();
            fillRT.anchorMin = Vector2.zero;
            fillRT.anchorMax = Vector2.one;
            fillRT.offsetMin = fillRT.offsetMax = Vector2.zero;

            // Label
            var label = new GameObject("Label", typeof(TextMeshProUGUI));
            label.transform.SetParent(go.transform, false);
            var text = label.GetComponent<TextMeshProUGUI>();
            text.alignment = TextAlignmentOptions.Center;
            text.fontSize = 16;
            text.text = stat.Type.ToString();
            var textRT = label.GetComponent<RectTransform>();
            textRT.anchorMin = Vector2.zero;
            textRT.anchorMax = Vector2.one;
            textRT.offsetMin = textRT.offsetMax = Vector2.zero;

            //var bar = go.GetComponent<StatBar>();
            bar.SetUIReferences(fillImage, text);
            bar.Bind(stat);

            go.transform.SetParent(parent, false);
            return bar;
        }

        private StatDisplay CreateStatDisplay(StatObservable stat, Transform parent, int index)
        {
            var go = new GameObject($"{stat.Type}Display", typeof(RectTransform), typeof(StatDisplay));
            var rt = go.GetComponent<RectTransform>();
            rt.sizeDelta = new Vector2(260, 24);
            rt.anchorMin = new Vector2(0.5f, 1f);
            rt.anchorMax = new Vector2(0.5f, 1f);
            rt.pivot = new Vector2(0.5f, 1f);
            go.transform.SetParent(parent, false);
            SetBarPosition(go.GetComponent<RectTransform>(), index);

            // Icon
            var iconGO = new GameObject("Icon", typeof(Image));
            iconGO.transform.SetParent(go.transform, false);
            var icon = iconGO.GetComponent<Image>();
            var iconRT = iconGO.GetComponent<RectTransform>();
            iconRT.anchorMin = new Vector2(0f, 0f);
            iconRT.anchorMax = new Vector2(0f, 1f);
            iconRT.sizeDelta = new Vector2(24f, 24f);
            iconRT.anchoredPosition = new Vector2(5f, 0f);

            // Label
            var labelGO = new GameObject("Label", typeof(TextMeshProUGUI));
            labelGO.transform.SetParent(go.transform, false);
            var label = labelGO.GetComponent<TextMeshProUGUI>();
            label.alignment = TextAlignmentOptions.Left;
            label.fontSize = 16;
            label.text = stat.Type.ToString();
            var labelRT = labelGO.GetComponent<RectTransform>();
            labelRT.anchorMin = new Vector2(0f, 0f);
            labelRT.anchorMax = new Vector2(1f, 1f);
            labelRT.offsetMin = new Vector2(30f, 0f);
            labelRT.offsetMax = new Vector2(0f, 0f);

            var display = go.GetComponent<StatDisplay>();
            display.SetUIReferences(icon, label);
            display.Bind(stat);

            return display;
        }


        private static async UniTaskVoid DestroyLaterSafe(GameObject go, float delaySeconds = 0.1f)
        {
            if (go == null) return;

            await UniTask.Delay(TimeSpan.FromSeconds(delaySeconds));

            if (go != null)
            {
                Destroy(go);
            }
        }


        public void Dispose()
        {
            _switchCts?.Cancel();
            foreach (var bar in _barPool.Values)
            {
                bar?.Dispose();
            }
        }
    }
}