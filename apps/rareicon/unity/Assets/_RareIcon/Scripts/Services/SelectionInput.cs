using System;
using UnityEngine.InputSystem;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Keyboard + right-mouse "cancel" driver for selection. ESC or right-click drops every SelectedTag (classic RTS deselect). Gated so build mode keeps first dibs on both inputs — BuildInputSource uses them to exit build mode — and skipped when the pointer is over UI so clicking a panel doesn't wipe the selection.</summary>
    public sealed class SelectionInput : ITickable, IDisposable
    {
        readonly SelectionController _selection;
        readonly BuildModeController _buildMode;
        readonly AppStateController _appState;
        readonly IMouseStateSource _mouse;

        public SelectionInput(
            SelectionController selection,
            BuildModeController buildMode,
            AppStateController appState,
            IMouseStateSource mouse)
        {
            _selection = selection;
            _buildMode = buildMode;
            _appState  = appState;
            _mouse     = mouse;
        }

        public void Tick()
        {
            if (_appState.Current.CurrentValue != AppInterfaceState.World) return;
            if (_buildMode.IsActive) return;

            bool escPressed = Keyboard.current != null && Keyboard.current.escapeKey.wasPressedThisFrame;
            bool rmbPressed = Mouse.current != null && Mouse.current.rightButton.wasPressedThisFrame;
            if (!escPressed && !rmbPressed) return;

            if (rmbPressed && !escPressed && _mouse.Value.OverUI) return;

            _selection.Clear();
        }

        public void Dispose() { }
    }
}
