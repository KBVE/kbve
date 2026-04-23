using System;
using UnityEngine.InputSystem;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>
    /// Main-thread keyboard/mouse driver for build mode; handles build mode toggle and cancel input while world input is allowed. TODO: Touch
    /// </summary>
    public sealed class BuildInputSource : ITickable, IDisposable
    {
        readonly BuildModeController _buildMode;
        readonly AppStateController _appState;

        [Inject]
        public BuildInputSource(
            BuildModeController buildMode,
            AppStateController appState)
        {
            _buildMode = buildMode;
            _appState = appState;
        }

         public void Tick()
        {
            if (!_appState.CanAcceptWorldInput())
                return;

            if (Keyboard.current is not { } kb) return;

            if (WasCancelPressed(kb))
            {
                CancelBuildMode();
                return;
            }

            if (kb.bKey.wasPressedThisFrame)
            {
                ToggleSelectedBuildTarget();
            }
        }


        static bool WasCancelPressed(Keyboard kb)
        {
            if (kb.escapeKey.wasPressedThisFrame)
                return true;

            if (Mouse.current?.rightButton.wasPressedThisFrame == true)
                return true;

            var touch = Touchscreen.current;
            if (touch == null)
                return false;

            int pressedCount = 0;
            foreach (var finger in touch.touches)
            {
                if (finger.press.isPressed)
                    pressedCount++;
            }

            return touch.primaryTouch.press.wasPressedThisFrame && pressedCount >= 2;
        }

        void CancelBuildMode()
        {
           if (_buildMode.IsActive)
                _buildMode.Exit();
        }

        void ToggleSelectedBuildTarget()
        {
            var target = ResolveBuildTarget();
            if (target != BuildTarget.None)
                _buildMode.Toggle(target);
        }

        static byte ResolveBuildTarget()
        {
            // v1: single hotkey target. TODO: Expand later into palette / hotbar / current selection lookup.
            return BuildTarget.Capital;
        }

        public void Dispose() { }
    }
}
