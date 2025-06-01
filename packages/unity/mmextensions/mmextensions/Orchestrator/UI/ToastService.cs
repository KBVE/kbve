using UnityEngine;
using TMPro;
using UnityEngine.UI;
using Cysharp.Threading.Tasks;
using System.Collections.Generic;
using System.Threading;
using KBVE.MMExtensions.Orchestrator.Interfaces;
using VContainer;
using VContainer.Unity;
using static UnityEngine.Object;


namespace KBVE.MMExtensions.Orchestrator.Core.UI
{
    public class ToastService : MonoBehaviour, IToastService, IAsyncStartable
    {
        private readonly Queue<ToastRequest> _toastQueue = new();
        private bool _isShowing;

        private TextMeshProUGUI _toastText;
        private Image _toastBackground;
        private CanvasGroup _toastGroup;

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

        private class ToastRequest
        {
            public string Message;
            public ToastType Type;
            public float Duration;
        }

        public bool IsInitialized => _toastText != null && _toastGroup != null && _toastBackground != null;

        public async UniTask StartAsync(CancellationToken cancellation)
        {
            await UniTask.NextFrame(cancellation);

            var canvas = GameObject.Find("Canvas") ?? FindFirstObjectByType<Canvas>()?.gameObject;
            if (canvas == null)
            {
                Debug.LogError("[ToastService] Canvas not found. ToastService cannot initialize.");
                return;
            }

            var panel = await WaitForChild(canvas, "ToastPanel", 30, 0.1f);
            if (panel == null)
            {
                Debug.LogError("[ToastService] ToastPanel not found in Canvas hierarchy after retries.");
                return;
            }

            _toastText = FindChildComponentByName<TextMeshProUGUI>(panel, "ToastText", true);
            if (_toastText == null)
            {
                Debug.LogError("[ToastService] No TextMeshProUGUI found under ToastPanel.");
                return;
            }

            _toastBackground = panel.GetComponent<Image>() ?? panel.AddComponent<Image>();
            _toastBackground.color = Color.black;

            _toastGroup = panel.GetComponent<CanvasGroup>() ?? panel.AddComponent<CanvasGroup>();
            _toastGroup.alpha = 0f;

            Debug.Log("[ToastService] Initialized successfully.");
        }

        public void ShowToast(string message, ToastType type = ToastType.Info, float duration = 2.5f)
        {
            if (!IsInitialized)
            {
                Debug.LogWarning("[ToastService] Tried to show toast before initialization.");
                return;
            }


            _toastQueue.Clear();
            _toastQueue.Enqueue(new ToastRequest { Message = message, Type = type, Duration = duration });
            if (!_isShowing) ProcessQueueAsync().Forget();
        }

        public void EnqueueToast(string message, ToastType type = ToastType.Info, float duration = 2.5f)
        {
            _toastQueue.Enqueue(new ToastRequest { Message = message, Type = type, Duration = duration });
            if (!_isShowing) ProcessQueueAsync().Forget();
        }

        public void ShowImmediateToast(string message, ToastType type = ToastType.Info, float duration = 2.5f)
        {
            _toastQueue.Clear();
            _toastQueue.Enqueue(new ToastRequest { Message = message, Type = type, Duration = duration });
            ProcessQueueAsync().Forget();
        }

        public void ClearAllToasts()
        {
            _toastQueue.Clear();
            _isShowing = false;
            if (_toastGroup != null)
            {
                _toastGroup.alpha = 0f;
            }
        }

        private async UniTaskVoid ProcessQueueAsync()
        {
            _isShowing = true;

            while (_toastQueue.Count > 0)
            {
                var toast = _toastQueue.Dequeue();
                await ShowSingleToastAsync(toast.Message, toast.Type, toast.Duration);
            }

            _isShowing = false;
        }

        private async UniTask ShowSingleToastAsync(string message, ToastType type, float duration)
        {
            if (_toastGroup == null || _toastText == null || _toastBackground == null)
                return;

            _toastText.text = message;
            _toastBackground.color = _toastColors.TryGetValue(type, out var color)
                ? color
                : _toastColors[ToastType.Info];

            var rect = _toastText.GetComponent<RectTransform>();

            rect.localScale = Vector3.one * scaleDown;             // Reset scale and alpha
            _toastGroup.alpha = 0f;

            await AnimateScale(rect, scaleDown, scaleUp, scaleDuration);
            await FadeCanvasGroup(_toastGroup, 1f, fadeDuration);
            await AnimateScale(rect, scaleUp, 1f, scaleDuration); // settle to 1f

            await UniTask.Delay(System.TimeSpan.FromSeconds(duration));

            await FadeCanvasGroup(_toastGroup, 0f, fadeDuration);
        }



        private static async UniTask FadeCanvasGroup(CanvasGroup group, float targetAlpha, float duration)
        {
            if (group == null) return;

            float startAlpha = group.alpha;
            float time = 0f;

            while (time < duration)
            {
                group.alpha = Mathf.Lerp(startAlpha, targetAlpha, time / duration);
                time += Time.deltaTime;
                await UniTask.Yield();
            }

            group.alpha = targetAlpha;
        }

        private static async UniTask AnimateScale(RectTransform rectTransform, float from, float to, float duration)
        {
            if (rectTransform == null) return;

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

        private async UniTask<GameObject> WaitForChild(GameObject parent, string name, int maxRetries = 30, float retryDelay = 0.1f)
        {
            for (int i = 0; i < maxRetries; i++)
            {
                var child = FindChildByName(parent, name);
                if (child != null)
                    return child;
                await UniTask.Delay(System.TimeSpan.FromSeconds(retryDelay));
            }
            return null;
        }

        /// <summary>
        /// Finds a child GameObject by name within a given parent, including inactive ones.
        /// </summary>
        private static GameObject FindChildByName(GameObject parent, string name)
        {
            if (parent == null || string.IsNullOrWhiteSpace(name))
                return null;

            Transform direct = parent.transform.Find(name);
            if (direct != null)
                return direct.gameObject;

            foreach (Transform child in parent.GetComponentsInChildren<Transform>(true))
            {
                if (child.name == name)
                    return child.gameObject;
            }

            return null;
        }

        private static T FindChildComponentByName<T>(GameObject parent, string childName, bool includeInactive = true) where T : Component
        {
            if (parent == null)
            {
                Debug.LogError($"[ToastService] Parent GameObject is null.");
                return null;
            }

            Transform childTransform = null;

            foreach (Transform child in parent.GetComponentsInChildren<Transform>(includeInactive))
            {
                if (child.name == childName)
                {
                    childTransform = child;
                    break;
                }
            }

            if (childTransform == null)
            {
                Debug.LogError($"[ToastService] Could not find child GameObject named '{childName}' under '{parent.name}'.");
                return null;
            }

            var component = childTransform.GetComponent<T>();
            if (component == null)
            {
                Debug.LogError($"[ToastService] Found '{childName}', but it has no component of type '{typeof(T).Name}'.");
            }

            return component;
        }
    }
}
