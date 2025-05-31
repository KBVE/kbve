using UnityEngine;
using TMPro;
using UnityEngine.UI;
using Cysharp.Threading.Tasks;
using System.Collections.Generic;
using KBVE.MMExtensions.Orchestrator.Interfaces;

namespace KBVE.MMExtensions.Orchestrator.Core.UI
{
    public class ToastService : MonoBehaviour, IToastService
    {
        private readonly Queue<ToastRequest> _toastQueue = new();
        private bool _isShowing;

        private TextMeshProUGUI _toastText;
        private Image _toastBackground;
        private CanvasGroup _toastGroup;

        private readonly Dictionary<ToastType, Color> _toastColors = new()
        {
            { ToastType.Info, new Color(0.2f, 0.6f, 1f) },
            { ToastType.Success, new Color(0.2f, 0.8f, 0.4f) },
            { ToastType.Warning, new Color(1f, 0.6f, 0.2f) },
            { ToastType.Error, new Color(1f, 0.2f, 0.2f) }
        };

        private class ToastRequest
        {
            public string Message;
            public ToastType Type;
            public float Duration;
        }

        public void Initialize()
        {
            var canvas = GameObject.Find("Canvas");
            if (canvas == null)
            {
                Debug.LogError("[ToastService] Canvas not found.");
                return;
            }

            var panel = canvas.transform.Find("ToastPanel");
            if (panel == null)
            {
                Debug.LogError("[ToastService] ToastPanel not found under Canvas.");
                return;
            }

            _toastText = panel.GetComponentInChildren<TextMeshProUGUI>();
            _toastBackground = panel.GetComponent<Image>();
            _toastGroup = panel.GetComponent<CanvasGroup>();

            if (_toastGroup == null)
            {
                _toastGroup = panel.gameObject.AddComponent<CanvasGroup>();
            }

            _toastGroup.alpha = 0f;
        }

        public void ShowToast(string message, ToastType type = ToastType.Info, float duration = 2.5f)
        {
            _toastQueue.Clear();
            _toastQueue.Enqueue(new ToastRequest { Message = message, Type = type, Duration = duration });
            if (!_isShowing)
                ProcessQueueAsync().Forget();
        }

        public void EnqueueToast(string message, ToastType type = ToastType.Info, float duration = 2.5f)
        {
            _toastQueue.Enqueue(new ToastRequest { Message = message, Type = type, Duration = duration });
            if (!_isShowing)
                ProcessQueueAsync().Forget();
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
            _toastGroup.alpha = 0f;
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
            if (_toastGroup == null) return;

            _toastText.text = message;
            _toastBackground.color = _toastColors.TryGetValue(type, out var color) ? color : _toastColors[ToastType.Info];
            _toastGroup.alpha = 1f;

            await UniTask.Delay(System.TimeSpan.FromSeconds(duration));
            _toastGroup.alpha = 0f;
        }
    }
}
