using System;
using R3;
using Unity.Mathematics;
using UnityEngine;
using UnityEngine.InputSystem;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>
    /// Authoritative source for per-frame mouse state.
    /// Owns: input sampling, world projection, hex conversion, press-origin UI tracking.
    /// Delegates: camera lookup → CameraService, UI hit-test → IUiPointerBlocker.
    /// </summary>
    public interface IMouseStateSource
    {
        ReadOnlyReactiveProperty<MouseSnapshot> Current { get; }
        MouseSnapshot Value { get; }
    }

    public sealed class MouseStateSource : IMouseStateSource, ITickable, IDisposable
    {
        const float HexSize = 0.25f;

        readonly CameraService _cameras;
        readonly IUiPointerBlocker _uiBlocker;

        readonly SynchronizedReactiveProperty<MouseSnapshot> _current = new(MouseSnapshot.Empty);

        int2 _lastHex = new(int.MinValue, int.MinValue);
        bool _pressWasOverUi;

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
            var mouse = Mouse.current;
            if (cam == null || mouse == null) return;

            var sp = mouse.position.ReadValue();
            var screen = new float2(sp.x, sp.y);

            float zDist = math.abs(cam.transform.position.z);
            var world3 = cam.ScreenToWorldPoint(new Vector3(sp.x, sp.y, zDist));
            var world = new float2(world3.x, world3.y);

            var hex = WorldToHex(world);
            bool changed = !hex.Equals(_lastHex);
            _lastHex = hex;

            bool overUiNow = _uiBlocker.IsPointerOverUi(sp);
            bool pressed = mouse.leftButton.wasPressedThisFrame;
            bool released = mouse.leftButton.wasReleasedThisFrame;

            // Capture UI state at press time so a release that happens after the
            // UI element closes itself (cancel button hides modal) still counts as UI.
            if (pressed) _pressWasOverUi = overUiNow;
            bool effectiveOverUi = overUiNow || (released && _pressWasOverUi);

            _current.Value = new MouseSnapshot(
                screen, world, hex, changed, effectiveOverUi, pressed, released);
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
