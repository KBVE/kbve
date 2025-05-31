using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using KBVE.MMExtensions.Orchestrator.Interfaces;

namespace KBVE.MMExtensions.Orchestrator.Core.UI
{
    public class ToastService : MonoBehaviour, IToastService
    {
        private readonly Queue<ToastRequest> _toastQueue = new();
        private GameObject _canvas;
        private GameObject _toastRoot;
        private bool _isShowing;

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
            _canvas = GameObject.Find("Canvas");
            if (_canvas == null)
            {
                Debug.LogError("[ToastService] No Canvas found in scene.");
                return;
            }

            _toastRoot = new GameObject("ToastRoot");
            _toastRoot.transform.SetParent(_canvas.transform, false);
            _toastRoot.AddComponent<CanvasGroup>().alpha = 0f;
        }

        public void ShowToast(string message, ToastType type = ToastType.Info, float duration = 2.5f)
        {
            _toastQueue.Clear();
            _toastQueue.Enqueue(new ToastRequest { Message = message, Type = type, Duration = duration });
            if (!_isShowing) StartCoroutine(ProcessQueue());
        }

        public void EnqueueToast(string message, ToastType type = ToastType.Info, float duration = 2.5f)
        {
            _toastQueue.Enqueue(new ToastRequest { Message = message, Type = type, Duration = duration });
            if (!_isShowing) StartCoroutine(ProcessQueue());
        }

        public void ClearAllToasts()
        {
            StopAllCoroutines();
            _toastQueue.Clear();
            if (_toastRoot != null)
                _toastRoot.GetComponent<CanvasGroup>().alpha = 0f;

            _isShowing = false;
        }

        private IEnumerator ProcessQueue()
        {
            _isShowing = true;
            while (_toastQueue.Count > 0)
            {
                var toast = _toastQueue.Dequeue();
                yield return ShowSingleToast(toast.Message, toast.Type, toast.Duration);
            }
            _isShowing = false;
        }

        private IEnumerator ShowSingleToast(string message, ToastType type, float duration)
        {
            if (_toastRoot == null) yield break;

            var group = _toastRoot.GetComponent<CanvasGroup>();
            group.alpha = 1f;

            var textGO = new GameObject("ToastText");
            var text = textGO.AddComponent<TextMeshProUGUI>();
            text.text = message;
            text.fontSize = 28;
            text.color = Color.white;
            text.alignment = TextAlignmentOptions.Center;
            text.raycastTarget = false;

            var background = textGO.AddComponent<Image>();
            background.color = _toastColors.TryGetValue(type, out var c) ? c : _toastColors[ToastType.Info];
            background.raycastTarget = false;

            var rect = textGO.GetComponent<RectTransform>();
            rect.SetParent(_toastRoot.transform, false);
            rect.anchorMin = new Vector2(0.3f, 0.1f);
            rect.anchorMax = new Vector2(0.7f, 0.2f);
            rect.offsetMin = rect.offsetMax = Vector2.zero;

            yield return new WaitForSeconds(duration);

            Destroy(textGO);
            group.alpha = 0f;
        }

        public void ShowImmediateToast(string message, ToastType type = ToastType.Info, float duration = 2.5f)
        {
            // Stop current display, but keep the rest of the queue
            StopAllCoroutines();

            // Rebuild the queue with the new toast at the front
            var tempQueue = new Queue<ToastRequest>();
            tempQueue.Enqueue(new ToastRequest { Message = message, Type = type, Duration = duration });

            while (_toastQueue.Count > 0)
                tempQueue.Enqueue(_toastQueue.Dequeue());

            _toastQueue.Clear();
            foreach (var toast in tempQueue)
                _toastQueue.Enqueue(toast);

            StartCoroutine(ProcessQueue());
        }
    }
}
