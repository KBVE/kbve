using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace RareIcon
{
    /// <summary>
    /// Single source of truth for mouse state — written once per frame on main thread.
    /// All systems read this singleton instead of querying Mouse/Camera/UI directly.
    /// </summary>
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial struct MouseStateSystem : ISystem
    {
        const float HexSize = 0.25f;
        int2 _lastHex;
        bool _pressWasOverUI;

        public void OnCreate(ref SystemState state)
        {
            state.EntityManager.CreateSingleton(new MouseState
            {
                WorldPos = float2.zero,
                HexCoord = new int2(int.MinValue, int.MinValue),
                Changed = false,
                OverUI = false,
                LeftPressedThisFrame = false,
                LeftReleasedThisFrame = false,
            });
            _lastHex = new int2(int.MinValue, int.MinValue);
        }

        public void OnUpdate(ref SystemState state)
        {
            var cam = Camera.main;
            var mouse = Mouse.current;
            if (cam == null || mouse == null) return;

            var screenPos = mouse.position.ReadValue();
            float zDist = math.abs(cam.transform.position.z);
            var worldPos = cam.ScreenToWorldPoint(new Vector3(screenPos.x, screenPos.y, zDist));
            float2 wp = new float2(worldPos.x, worldPos.y);

            // World to hex
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

            int2 hexCoord = new int2((int)rounded.x, (int)rounded.z);
            bool changed = !hexCoord.Equals(_lastHex);
            _lastHex = hexCoord;

            bool overUI = IsPointerOverUI(screenPos);
            bool pressed = mouse.leftButton.wasPressedThisFrame;
            bool released = mouse.leftButton.wasReleasedThisFrame;

            // Track if the press was over UI — release inherits that state.
            // Prevents click-through when UI element closes itself between
            // press and release (e.g. cancel button hides the modal).
            if (pressed) _pressWasOverUI = overUI;

            // Treat release as "over UI" if either current pos or original press was over UI
            bool effectiveOverUI = overUI || (released && _pressWasOverUI);

            SystemAPI.SetSingleton(new MouseState
            {
                WorldPos = wp,
                HexCoord = hexCoord,
                Changed = changed,
                OverUI = effectiveOverUI,
                LeftPressedThisFrame = pressed,
                LeftReleasedThisFrame = released,
            });
        }

        static UIDocument[] _docCache;
        static float _lastDocCacheTime = -1f;

        static bool IsPointerOverUI(Vector2 screenPos)
        {
            // Cache UIDocument lookup — refresh once per second
            if (_docCache == null || Time.unscaledTime - _lastDocCacheTime > 1f)
            {
                _docCache = Object.FindObjectsByType<UIDocument>(FindObjectsSortMode.None);
                _lastDocCacheTime = Time.unscaledTime;
            }

            // UI Toolkit panel Y is top-down, screen Y is bottom-up
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
    }
}
