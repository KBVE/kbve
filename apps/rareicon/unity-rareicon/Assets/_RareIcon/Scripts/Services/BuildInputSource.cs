using System;
using UnityEngine.InputSystem;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>
    /// Keyboard driver for build mode: `B` toggles it (currently always
    /// BuildTarget.Capital — hook in a palette when more building types
    /// land), `Escape` / `Right-click` forces exit. Runs as an ITickable
    /// VContainer service so input polling happens on the main thread
    /// alongside MouseStateSource.
    ///
    /// Only acts while the app is in the World interface state — the
    /// same gate UIWorldSearch uses, so keys don't fire on the title
    /// screen or in menus.
    /// </summary>
    public sealed class BuildInputSource : ITickable, IDisposable
    {
        readonly BuildModeController _buildMode;
        readonly AppStateController _appState;

        public BuildInputSource(
            BuildModeController buildMode,
            AppStateController appState)
        {
            _buildMode = buildMode;
            _appState = appState;
        }

        public void Tick()
        {
            if (_appState.Current.CurrentValue != AppInterfaceState.World) return;

            var kb = Keyboard.current;
            if (kb == null) return;

            if (kb.bKey.wasPressedThisFrame)
            {
                _buildMode.Toggle(BuildTarget.Capital);
            }
            else if (kb.escapeKey.wasPressedThisFrame && _buildMode.IsActive)
            {
                _buildMode.Exit();
            }

            // Right-click also cancels — common RTS convention.
            var mouse = Mouse.current;
            if (mouse != null && mouse.rightButton.wasPressedThisFrame && _buildMode.IsActive)
            {
                _buildMode.Exit();
            }
        }

        public void Dispose() { }
    }
}
