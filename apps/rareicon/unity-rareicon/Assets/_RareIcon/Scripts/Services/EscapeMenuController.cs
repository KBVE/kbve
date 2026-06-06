using System;
using UnityEngine;
using UnityEngine.InputSystem;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Owns the global Escape key behaviour: close the topmost open panel if any are open, otherwise toggle the Settings window. A 250 ms cooldown debounces rapid taps so a single fast escape can't open + close Settings on consecutive frames. Defers to <see cref="BuildModeController"/> when build mode is active — <see cref="BuildInputSource"/> already handles escape there as the build-cancel verb.</summary>
    public sealed class EscapeMenuController : ITickable, IDisposable
    {
        const float CooldownSeconds = 0.25f;

        readonly UISettings          _settings;
        readonly UIBuildingPalette   _palette;
        readonly UITreasury          _treasury;
        readonly UICitizensPanel     _citizens;
        readonly UIMilitary          _military;
        readonly UIBuildingInspector _inspector;
        readonly BuildModeController _buildMode;
        readonly AppStateController  _appState;

        float _nextAcceptUnscaledTime;

        [Inject]
        public EscapeMenuController(
            UISettings          settings,
            UIBuildingPalette   palette,
            UITreasury          treasury,
            UICitizensPanel     citizens,
            UIMilitary          military,
            UIBuildingInspector inspector,
            BuildModeController buildMode,
            AppStateController  appState)
        {
            _settings  = settings;
            _palette   = palette;
            _treasury  = treasury;
            _citizens  = citizens;
            _military  = military;
            _inspector = inspector;
            _buildMode = buildMode;
            _appState  = appState;
        }

        public void Tick()
        {
            if (Time.unscaledTime < _nextAcceptUnscaledTime) return;

            var kb = Keyboard.current;
            if (kb == null || !kb.escapeKey.wasPressedThisFrame) return;

            if (_buildMode.IsActive) return;

            var state = _appState.Current.CurrentValue;
            if (state != AppInterfaceState.World
             && state != AppInterfaceState.InTile
             && state != AppInterfaceState.MainMenu) return;

            _nextAcceptUnscaledTime = Time.unscaledTime + CooldownSeconds;

            if (TryCloseTopmost()) return;
            _settings.Toggle();
        }

        bool TryCloseTopmost()
        {

            if (_settings.IsOpen.CurrentValue)  { _settings.Close();  return true; }
            if (_palette.IsOpen.CurrentValue)   { _palette.Close();   return true; }
            if (_treasury.IsOpen.CurrentValue)  { _treasury.Close();  return true; }
            if (_citizens.IsOpen.CurrentValue)  { _citizens.Close();  return true; }
            if (_military.IsOpen.CurrentValue)  { _military.Close();  return true; }
            if (_inspector.IsOpen.CurrentValue) { _inspector.Close(); return true; }
            return false;
        }

        public void Dispose() { }
    }
}
