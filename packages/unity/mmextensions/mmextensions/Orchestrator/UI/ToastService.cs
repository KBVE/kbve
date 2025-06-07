using UnityEngine;
using TMPro;
using UnityEngine.UI;
using Cysharp.Threading.Tasks;
using System;
using System.Collections.Generic;
using System.Threading;
using KBVE.MMExtensions.Orchestrator.Interfaces;
using VContainer;
using VContainer.Unity;
using static UnityEngine.Object;
using UnityEngine.AddressableAssets;
using UnityEngine.SceneManagement;
using R3;
using ObservableCollections;

namespace KBVE.MMExtensions.Orchestrator.Core.UI
{
    public class ToastService : MonoBehaviour, IToastService, IAsyncStartable, IDisposable
    {
        //private readonly Queue<ToastRequest> _toastQueue = new();
        public ObservableList<ToastRequest> ToastQueue { get; } = new ObservableList<ToastRequest>();

        private const string DefaultBackgroundKey = "toast_background";

        private IGlobalCanvas _globalCanvas;

        private IDisposable _toastSubscription;
        private bool _isShowing;
        private TextMeshProUGUI _toastText;
        private Image _toastBackground;

        private CanvasGroup _toastGroup;
        private RectTransform _panelRect;

        [Inject]
        public void Construct(IGlobalCanvas globalCanvas)
        {
            _globalCanvas = globalCanvas;
        }

        private readonly Dictionary<ToastType, Color> _toastColors = new()
        {
            { ToastType.Info,    new Color(0.2f, 0.6f, 1f) },
            { ToastType.Success, new Color(0.2f, 0.8f, 0.4f) },
            { ToastType.Warning, new Color(1f, 0.6f, 0.2f) },
            { ToastType.Error,   new Color(1f, 0.2f, 0.2f) }
        };

        [SerializeField] private float fadeDuration = 0.2f;
        [SerializeField] private float scaleUp = 1.1f;
        [SerializeField] private float scaleDown = 1f;
        [SerializeField] private float scaleDuration = 0.1f;

        public struct ToastRequest
        {
            public string Message;
            public ToastType Type;
            public float Duration;
            public string BackgroundAddressableKey;
        }


        public bool IsInitialized => _toastText != null && _toastGroup != null && _toastBackground != null;

        public async UniTask StartAsync(CancellationToken cancellation)
        {
            await UniTask.NextFrame(cancellation);

            if (_globalCanvas == null)
            {
                Debug.LogError("[ToastService] GlobalCanvas reference not injected.");
                return;
            }

            await UniTask.WaitUntil(() => _globalCanvas != null && _globalCanvas.Canvas != null, cancellationToken: cancellation);

            if (_globalCanvas is GlobalCanvasService canvasService)
            {
                await UniTask.WaitUntil(() => canvasService.IsReady.Value, cancellationToken: cancellation);
            }

            var panel = CreateToastPanel();
            panel = _globalCanvas.SpawnPanel(panel, UICanvasLayer.Toast);
            _panelRect = panel.GetComponent<RectTransform>();

            _toastText = panel.transform.Find("ToastText")?.GetComponent<TextMeshProUGUI>();
            _toastBackground = panel.GetComponent<Image>();
            _toastGroup = panel.GetComponent<CanvasGroup>();
            _toastGroup.alpha = 0f;

            if (!IsInitialized)
            {
                Debug.LogError("[ToastService] Initialization failed.");
                return;
            }

            _toastSubscription = ToastQueue.ObserveAdd(cancellationToken: cancellation)
                .Subscribe(_ =>
                {
                    if (!_isShowing)
                        ProcessQueueAsync().Forget();
                });

            Debug.Log("[ToastService] Initialized.");
        }

        public void Show(string message, ToastType type = ToastType.Info, float duration = 2.5f, string backgroundKey = null)
        {
            ToastQueue.Add(new ToastRequest
            {
                Message = message,
                Type = type,
                Duration = duration,
                BackgroundAddressableKey = string.IsNullOrWhiteSpace(backgroundKey)
            ? DefaultBackgroundKey
            : backgroundKey
            });
        }

        public void ClearAllToasts()
        {
            ToastQueue.Clear();
            _isShowing = false;
            if (_toastGroup != null)
                _toastGroup.alpha = 0f;
        }

        private async UniTaskVoid ProcessQueueAsync()
        {
            _isShowing = true;

            while (ToastQueue.Count > 0)
            {
                var toast = ToastQueue[0];
                ToastQueue.RemoveAt(0);
                await ShowSingleToastAsync(toast);
            }

            _isShowing = false;
        }

        private async UniTask ShowSingleToastAsync(ToastRequest toast)
        {
            if (!IsInitialized) return;

            _toastText.text = toast.Message;
            _toastBackground.color = _toastColors.TryGetValue(toast.Type, out var color)
                ? color
                : _toastColors[ToastType.Info];

            _toastText.ForceMeshUpdate();
            var preferred = _toastText.GetPreferredValues(toast.Message, Screen.width * 0.9f, Mathf.Infinity);
            var width = Mathf.Clamp(preferred.x + 40f, 200f, Screen.width * 0.9f);
            var height = Mathf.Clamp(preferred.y + 20f, 60f, Screen.height * 0.3f);
            if (_panelRect != null)
            {
                _panelRect.SetSizeWithCurrentAnchors(RectTransform.Axis.Horizontal, width);
                _panelRect.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical, height);
            }

            await LoadBackgroundImage(toast.BackgroundAddressableKey);

            var rect = _panelRect ?? _toastText.GetComponent<RectTransform>();
            rect.localScale = Vector3.one * scaleDown;
            _toastGroup.alpha = 0f;

            var targetPos = rect.anchoredPosition;
            var startPos = targetPos + new Vector2(0f, -150f);
            rect.anchoredPosition = startPos;

            await AnimateSlideAndScale(rect, startPos, targetPos, scaleDown, scaleUp, scaleDuration);
            await FadeCanvasGroup(_toastGroup, 1f, fadeDuration);
            await AnimateScale(rect, scaleUp, 1f, scaleDuration);

            await UniTask.Delay(System.TimeSpan.FromSeconds(toast.Duration));
            await FadeCanvasGroup(_toastGroup, 0f, fadeDuration);

           
        }

        private async UniTask LoadBackgroundImage(string addressableKey)
        {
            if (string.IsNullOrWhiteSpace(addressableKey) || _toastBackground == null)
                return;

            try
            {
                var handle = Addressables.LoadAssetAsync<Sprite>(addressableKey);
                await handle.ToUniTask();
                var sprite = handle.Result;

                _toastBackground.sprite = sprite;
                _toastBackground.enabled = sprite != null;
            }
            catch
            {
                Debug.LogWarning($"[ToastService] Failed to load background '{addressableKey}'.");
                    _toastBackground.sprite = null;
                    _toastBackground.enabled = false;
            }
            await UniTask.Yield();
        }

        private static async UniTask FadeCanvasGroup(CanvasGroup group, float targetAlpha, float duration)
        {
            float start = group.alpha;
            float time = 0f;

            while (time < duration)
            {
                group.alpha = Mathf.Lerp(start, targetAlpha, time / duration);
                time += Time.deltaTime;
                await UniTask.Yield();
            }

            group.alpha = targetAlpha;
        }

        private static async UniTask AnimateSlideAndScale(RectTransform rectTransform, Vector2 fromPos, Vector2 toPos, float fromScale, float toScale, float duration)
        {
            float time = 0f;

            while (time < duration)
            {
                float t = time / duration;
                rectTransform.anchoredPosition = Vector2.Lerp(fromPos, toPos, t);
                float scale = Mathf.Lerp(fromScale, toScale, t);
                rectTransform.localScale = new Vector3(scale, scale, 1f);

                time += Time.deltaTime;
                await UniTask.Yield();
            }

            rectTransform.anchoredPosition = toPos;
            rectTransform.localScale = new Vector3(toScale, toScale, 1f);
        }

        private static async UniTask AnimateScale(RectTransform rectTransform, float from, float to, float duration)
        {
            float time = 0f;

            while (time < duration)
            {
                float scale = Mathf.Lerp(from, to, time / duration);
                rectTransform.localScale = new Vector3(scale, scale, 1f);
                time += Time.deltaTime;
                await UniTask.Yield();
            }

            rectTransform.localScale = new Vector3(to, to, 1f);
        }


        private GameObject CreateToastPanel()
        {
            var panel = new GameObject("ToastPanel", typeof(RectTransform), typeof(Image), typeof(CanvasGroup));

            var rect = panel.GetComponent<RectTransform>();
            rect.anchorMin = new Vector2(1f, 0f);
            rect.anchorMax = new Vector2(1f, 0f);
            rect.pivot = new Vector2(1f, 0.5f);
            rect.sizeDelta = new Vector2(600f, 80f);

            float xOffset = Mathf.Min(Screen.width * 0.05f, 120f);
            float yOffset = Mathf.Min(Screen.height * 0.1f, 160f);
            rect.anchoredPosition = new Vector2(-xOffset, yOffset);

            var textGO = new GameObject("ToastText", typeof(RectTransform), typeof(TextMeshProUGUI));
            textGO.transform.SetParent(panel.transform, false);

            var textRect = textGO.GetComponent<RectTransform>();
            textRect.anchorMin = Vector2.zero;
            textRect.anchorMax = Vector2.one;
            textRect.offsetMin = textRect.offsetMax = Vector2.zero;

            var text = textGO.GetComponent<TextMeshProUGUI>();
            text.alignment = TextAlignmentOptions.Center;
            text.fontSize = 36;
            text.color = Color.white;
            text.enableAutoSizing = true;
            text.textWrappingMode = TextWrappingModes.Normal;
            //text.enableWordWrapping = true;
            text.outlineWidth = 0.2f;
            text.outlineColor = new Color(0f, 0f, 0f, 0.9f);

            var image = panel.GetComponent<Image>();
            image.color = Color.black;

            var group = panel.GetComponent<CanvasGroup>();
            group.alpha = 0f;

            return panel;
        }


        private void OnDestroy()
        {
            _toastSubscription?.Dispose();
        }

        public void Dispose()
        {
            _toastSubscription?.Dispose();
            _toastSubscription = null;
        }
    }
}
