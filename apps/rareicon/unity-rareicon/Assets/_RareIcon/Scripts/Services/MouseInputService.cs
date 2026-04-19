using System;
using R3;
using Unity.Mathematics;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>
    /// Global mouse event source — reactive properties + observables.
    /// All consumers (ECS systems, UI) subscribe via R3 instead of polling
    /// Mouse.current or Camera.main directly.
    ///
    /// Thread-safe via SynchronizedReactiveProperty. ITickable runs on main thread.
    /// </summary>
    public class MouseInputService : ITickable, IDisposable
    {
        readonly SynchronizedReactiveProperty<float2> _screenPos = new(float2.zero);
        readonly SynchronizedReactiveProperty<float2> _worldPos = new(float2.zero);
        readonly SynchronizedReactiveProperty<bool> _overUI = new(false);

        readonly Subject<Unit> _leftPressed = new();
        readonly Subject<Unit> _leftReleased = new();

        // "Click intent" — released outside UI AND press was outside UI
        readonly Subject<float2> _clickInWorld = new();

        public ReadOnlyReactiveProperty<float2> ScreenPos => _screenPos;
        public ReadOnlyReactiveProperty<float2> WorldPos => _worldPos;
        public ReadOnlyReactiveProperty<bool> OverUI => _overUI;

        public Observable<Unit> LeftPressed => _leftPressed;
        public Observable<Unit> LeftReleased => _leftReleased;
        public Observable<float2> ClickInWorld => _clickInWorld;

        bool _pressWasOverUI;
        UIDocument[] _docCache;
        float _docCacheTime = -1f;

        public void Tick()
        {
            var mouse = Mouse.current;
            var cam = Camera.main;
            if (mouse == null || cam == null) return;

            var sp = mouse.position.ReadValue();
            float2 screen = new float2(sp.x, sp.y);

            // World pos
            float zDist = math.abs(cam.transform.position.z);
            var worldVec = cam.ScreenToWorldPoint(new Vector3(sp.x, sp.y, zDist));
            float2 world = new float2(worldVec.x, worldVec.y);

            // UI hit test
            bool overUI = HitTestUI(sp);

            _screenPos.Value = screen;
            _worldPos.Value = world;
            _overUI.Value = overUI;

            // Edge events
            if (mouse.leftButton.wasPressedThisFrame)
            {
                _pressWasOverUI = overUI;
                _leftPressed.OnNext(Unit.Default);
            }

            if (mouse.leftButton.wasReleasedThisFrame)
            {
                _leftReleased.OnNext(Unit.Default);

                // World click intent — only if neither press nor release was over UI
                if (!overUI && !_pressWasOverUI)
                    _clickInWorld.OnNext(world);
            }
        }

        bool HitTestUI(Vector2 screenPos)
        {
            if (_docCache == null || Time.unscaledTime - _docCacheTime > 1f)
            {
                _docCache = UnityEngine.Object.FindObjectsByType<UIDocument>(FindObjectsSortMode.None);
                _docCacheTime = Time.unscaledTime;
            }

            var panelPos = new Vector2(screenPos.x, Screen.height - screenPos.y);

            for (int i = 0; i < _docCache.Length; i++)
            {
                var doc = _docCache[i];
                if (doc == null || doc.rootVisualElement == null) continue;
                var panel = doc.rootVisualElement.panel;
                if (panel == null) continue;
                var picked = panel.Pick(panelPos);
                if (picked != null && picked.pickingMode == PickingMode.Position)
                    return true;
            }
            return false;
        }

        public void Dispose()
        {
            _screenPos?.Dispose();
            _worldPos?.Dispose();
            _overUI?.Dispose();
            _leftPressed?.Dispose();
            _leftReleased?.Dispose();
            _clickInWorld?.Dispose();
        }
    }
}
