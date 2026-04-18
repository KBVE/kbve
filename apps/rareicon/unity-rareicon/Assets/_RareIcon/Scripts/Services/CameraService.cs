using R3;
using UnityEngine;
using UnityEngine.InputSystem;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>
    /// Camera management — cached ref, reactive zoom, WASD/arrow movement, scroll zoom.
    /// Uses new Input System. Registered as singleton with ITickable.
    /// </summary>
    public class CameraService : ITickable
    {
        Camera _camera;
        Transform _transform;

        readonly ReactiveProperty<float> _zoom = new(12f);
        public ReadOnlyReactiveProperty<float> Zoom => _zoom;

        public const float MinZoom = 3f;
        public const float MaxZoom = 50f;
        public const float ZoomSpeed = 3f;
        public const float MoveSpeed = 15f;

        public Camera Camera
        {
            get
            {
                if (_camera == null) Refresh();
                return _camera;
            }
        }

        public Transform Transform
        {
            get
            {
                if (_transform == null) Refresh();
                return _transform;
            }
        }

        public void Refresh()
        {
            _camera = Camera.main;
            _transform = _camera != null ? _camera.transform : null;

            if (_camera != null && _camera.orthographic)
                _camera.orthographicSize = _zoom.Value;
        }

        public void Tick()
        {
            if (_camera == null)
            {
                Refresh();
                if (_camera == null) return;
            }

            HandleMovement();
            HandleZoom();
        }

        void HandleMovement()
        {
            var keyboard = Keyboard.current;
            if (keyboard == null) return;

            float h = 0f;
            float v = 0f;

            if (keyboard.wKey.isPressed || keyboard.upArrowKey.isPressed) v += 1f;
            if (keyboard.sKey.isPressed || keyboard.downArrowKey.isPressed) v -= 1f;
            if (keyboard.aKey.isPressed || keyboard.leftArrowKey.isPressed) h -= 1f;
            if (keyboard.dKey.isPressed || keyboard.rightArrowKey.isPressed) h += 1f;

            if (Mathf.Abs(h) < 0.001f && Mathf.Abs(v) < 0.001f) return;

            float speed = MoveSpeed * (_zoom.Value / 12f) * Time.deltaTime;
            var pos = _transform.position;
            pos.x += h * speed;
            pos.y += v * speed;
            _transform.position = pos;
        }

        void HandleZoom()
        {
            var mouse = Mouse.current;
            if (mouse == null) return;

            float scroll = mouse.scroll.ReadValue().y / 120f;
            if (Mathf.Abs(scroll) < 0.001f) return;

            float newZoom = Mathf.Clamp(_zoom.Value - scroll * ZoomSpeed, MinZoom, MaxZoom);
            if (Mathf.Approximately(newZoom, _zoom.Value)) return;

            _zoom.Value = newZoom;
            _camera.orthographicSize = newZoom;
        }
    }
}
