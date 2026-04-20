using R3;

namespace RareIcon
{
    /// <summary>
    /// Authoritative build-mode state. Owned by the UI container (VContainer
    /// singleton); the WorldHUD "Build" button, keyboard input source, and
    /// ECS-side preview/spawn systems all read and write through this one
    /// service instead of threading the state through multiple singletons.
    ///
    /// Uses an R3 ReactiveProperty so UI callbacks (button visual toggle,
    /// menu state sync) and systems that read the current target stay in
    /// lockstep.
    /// </summary>
    public sealed class BuildModeController
    {
        readonly ReactiveProperty<byte> _target = new(BuildTarget.None);

        /// <summary>Current BuildTarget.* — None when build mode is off.</summary>
        public ReadOnlyReactiveProperty<byte> Target => _target;

        public bool IsActive => _target.Value != BuildTarget.None;

        public void Enter(byte target)
        {
            if (target == BuildTarget.None) return;
            _target.Value = target;
        }

        public void Exit()
        {
            _target.Value = BuildTarget.None;
        }

        public void Toggle(byte target)
        {
            if (_target.Value == target) _target.Value = BuildTarget.None;
            else                         _target.Value = target;
        }
    }

    /// <summary>
    /// Static handoff between the managed BuildModeController (VContainer)
    /// and the ECS sync system. Set once at container build time, matching
    /// the MouseStateBridge pattern.
    /// </summary>
    public static class BuildModeBridge
    {
        public static BuildModeController Source;
    }
}
