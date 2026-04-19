using R3;
using Unity.Mathematics;
using UnityEngine;
using UnityEngine.InputSystem;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>
    /// Camera management — cached ref, reactive zoom/movement/hover.
    /// Uses new Input System. Registered as singleton with ITickable.
    /// All state exposed as R3 reactive properties for zero-coupling subscriptions.
    /// </summary>
    public class CameraService : ITickable
    {
        Camera _camera;
        Transform _transform;

        readonly ReactiveProperty<float> _zoom = new(12f);
        public ReadOnlyReactiveProperty<float> Zoom => _zoom;

        readonly ReactiveProperty<int2> _hoveredHex = new(new int2(int.MinValue, int.MinValue));
        public ReadOnlyReactiveProperty<int2> HoveredHex => _hoveredHex;

        readonly ReactiveProperty<float2> _worldMousePos = new(float2.zero);
        public ReadOnlyReactiveProperty<float2> WorldMousePos => _worldMousePos;

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
            UpdateMouseWorldPos();
        }

        void UpdateMouseWorldPos()
        {
            var mouse = Mouse.current;
            if (mouse == null) return;

            var screenPos = mouse.position.ReadValue();
            var worldPos = _camera.ScreenToWorldPoint(new Vector3(screenPos.x, screenPos.y, 0));
            _worldMousePos.Value = new float2(worldPos.x, worldPos.y);
        }

        /// <summary>
        /// Called by HexHoverSystem when it determines which hex the mouse is over.
        /// </summary>
        public void SetHoveredHex(int2 hexCoord)
        {
            if (!hexCoord.Equals(_hoveredHex.Value))
                _hoveredHex.Value = hexCoord;
        }

        /// <summary>
        /// Instantly center the camera on a world XY position. Z is preserved.
        /// Used by UIWorldSearch (Go-to-coord + Find biome).
        /// </summary>
        public void JumpTo(float2 worldPos)
        {
            if (_transform == null)
            {
                Refresh();
                if (_transform == null) return;
            }
            var p = _transform.position;
            p.x = worldPos.x;
            p.y = worldPos.y;
            _transform.position = p;
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
