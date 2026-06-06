using System;
using R3;
using Unity.Mathematics;
using UnityEngine;
using UnityEngine.InputSystem;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Authoritative source for per-frame mouse state. Owns input sampling, world projection, hex conversion, UI press-origin tracking, and drag detection.</summary>
    public interface IMouseStateSource
    {
        ReadOnlyReactiveProperty<MouseSnapshot> Current { get; }
        MouseSnapshot Value { get; }
    }

    public sealed class MouseStateSource : IMouseStateSource, ITickable, IDisposable
    {
        const float HexSize = 0.25f;
        const float DragThresholdPx = 6f;

        readonly CameraService _cameras;
        readonly IUiPointerBlocker _uiBlocker;

        readonly SynchronizedReactiveProperty<MouseSnapshot> _current = new(MouseSnapshot.Empty);

        int2 _lastHex = new(int.MinValue, int.MinValue);
        bool _pressWasOverUi;
        bool _leftHeld;
        bool _isDragging;
        float2 _pressScreenPos;
        float2 _pressWorldPos;

        public ReadOnlyReactiveProperty<MouseSnapshot> Current => _current;
        public MouseSnapshot Value => _current.Value;

        public MouseStateSource(CameraService cameras, IUiPointerBlocker uiBlocker)
        {
            _cameras = cameras;
            _uiBlocker = uiBlocker;
        }

        public void Tick()
        {
            var cam = _cameras.Camera;

            var pointer = Pointer.current;
            if (cam == null || pointer == null) return;

            var sp = pointer.position.ReadValue();
            var screen = new float2(sp.x, sp.y);

            float zDist = math.abs(cam.transform.position.z);
            var world3 = cam.ScreenToWorldPoint(new Vector3(sp.x, sp.y, zDist));
            var world = new float2(world3.x, world3.y);

            var hex = WorldToHex(world);
            bool changed = !hex.Equals(_lastHex);
            _lastHex = hex;

            bool overUiNow = _uiBlocker.IsPointerOverUi(sp);
            bool pressed = pointer.press.wasPressedThisFrame;
            bool released = pointer.press.wasReleasedThisFrame;

            if (pressed)
            {
                _pressWasOverUi = overUiNow;
                _leftHeld = true;
                _isDragging = false;
                _pressScreenPos = screen;
                _pressWorldPos = world;
            }

            bool dragStartedThisFrame = false;
            if (_leftHeld && !_isDragging && !_pressWasOverUi)
            {
                float2 delta = screen - _pressScreenPos;
                if (math.lengthsq(delta) >= DragThresholdPx * DragThresholdPx)
                {
                    _isDragging = true;
                    dragStartedThisFrame = true;
                }
            }

            bool dragEndedThisFrame = false;
            bool isDragging = _isDragging;
            if (released)
            {
                if (_isDragging) dragEndedThisFrame = true;
                _leftHeld = false;
                _isDragging = false;
            }

            bool effectiveOverUi = overUiNow || (released && _pressWasOverUi);

            _current.Value = new MouseSnapshot(
                screen, world, hex, changed, effectiveOverUi,
                pressed, released,
                isDragging, dragStartedThisFrame, dragEndedThisFrame,
                _pressScreenPos, _pressWorldPos);
        }

        static int2 WorldToHex(float2 wp)
        {
            float q = (math.sqrt(3f) / 3f * wp.x - 1f / 3f * wp.y) / HexSize;
            float r = (2f / 3f * wp.y) / HexSize;

            float3 cube = new float3(q, -q - r, r);
            float3 rounded = math.round(cube);
            float3 diff = math.abs(rounded - cube);

            if (diff.x > diff.y && diff.x > diff.z)
                rounded.x = -rounded.y - rounded.z;
            else if (diff.y > diff.z)
                rounded.y = -rounded.x - rounded.z;
            else
                rounded.z = -rounded.x - rounded.y;

            return new int2((int)rounded.x, (int)rounded.z);
        }

        public void Dispose()
        {
            _current?.Dispose();
        }
    }
}
