using UnityEngine;
using TMPro;
using UnityEngine.UI;
using Cysharp.Threading.Tasks;
using System.Collections.Generic;
using System.Threading;
using KBVE.MMExtensions.Orchestrator.Interfaces;
using VContainer;
using VContainer.Unity;

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

        private class ToastRequest
        {
            public string Message;
            public ToastType Type;
            public float Duration;
        }

        public async UniTask StartAsync(CancellationToken cancellation)
        {
            await UniTask.NextFrame(cancellation); // Let Unity settle before grabbing references

            var canvas = GameObject.Find("Canvas");
            if (canvas == null)
            {
                Debug.LogError("[ToastService] Canvas not found. ToastService cannot initialize.");
                return;
            }

            var panel = FindChildByName(canvas, "ToastPanel");
            if (panel == null)
            {
                Debug.LogError("[ToastService] ToastPanel not found in Canvas hierarchy.");
                return;
            }

            _toastText = FindChildComponentByName<TextMeshProUGUI>(panel, "ToastText", true);
            if (_toastText == null)
            {
                Debug.LogError("[ToastService] No TextMeshProUGUI found under ToastPanel.");
                return;
            }

            _toastBackground = panel.GetComponent<Image>();
            if (_toastBackground == null)
            {
                _toastBackground = panel.AddComponent<Image>();
                _toastBackground.color = Color.black;
                Debug.LogWarning("[ToastService] Image component missing on ToastPanel. Added default black background.");
            }

            _toastGroup = panel.GetComponent<CanvasGroup>();
            if (_toastGroup == null)
            {
                _toastGroup = panel.AddComponent<CanvasGroup>();
                Debug.LogWarning("[ToastService] CanvasGroup missing on ToastPanel. Added fallback.");
            }

            _toastGroup.alpha = 0f;

            Debug.Log("[ToastService] Initialized successfully.");
        }

        public void ShowToast(string message, ToastType type = ToastType.Info, float duration = 2.5f)
        {
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
            _toastGroup.alpha = 1f;

            await UniTask.Delay(System.TimeSpan.FromSeconds(duration));
            _toastGroup.alpha = 0f;
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
