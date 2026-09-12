using System;
using System.Threading;
using R3;

namespace RareIcon
{
    [Flags]
    public enum BuildBlockFlags
    {
        None          = 0,
        ServerBlocked = 1 << 0,
        Cooldown      = 1 << 1,
        NoResources   = 1 << 2,
        InvalidBiome  = 1 << 3,
        Stunned       = 1 << 4,
        MenuLocked    = 1 << 5,
    }

    public readonly struct BuildModeSnapshot : IEquatable<BuildModeSnapshot>
    {
        public readonly byte Target;
        public readonly BuildBlockFlags BlockFlags;

        public BuildModeSnapshot(byte target, BuildBlockFlags blockFlags)
        {
            Target = target;
            BlockFlags = blockFlags;
        }

        public bool HasTarget => Target != BuildTarget.None;
        public bool IsBlocked => BlockFlags != BuildBlockFlags.None;
        public bool IsActive => HasTarget && !IsBlocked;

        public readonly bool Equals(BuildModeSnapshot other)
        {
        return Target == other.Target && BlockFlags == other.BlockFlags;
        }

        public override bool Equals(object obj)
        {
            return obj is BuildModeSnapshot other && Equals(other);
        }

        public override int GetHashCode()
        {
            return HashCode.Combine(Target, (int)BlockFlags);
        }

        public static bool operator ==(BuildModeSnapshot left, BuildModeSnapshot right) => left.Equals(right);
        public static bool operator !=(BuildModeSnapshot left, BuildModeSnapshot right) => !left.Equals(right);

    }

    public sealed class BuildModeController : IDisposable
    {
        readonly SynchronizedReactiveProperty<byte> _targetReactive = new(BuildTarget.None);
        readonly SynchronizedReactiveProperty<int> _blockFlagsReactive = new((int)BuildBlockFlags.None);
        readonly SynchronizedReactiveProperty<BuildModeSnapshot> _snapshotReactive =
            new(new BuildModeSnapshot(BuildTarget.None, BuildBlockFlags.None));

        int _disposed;
        int _blockFlags;
        int _target;
        int _lastExitFrame = int.MinValue;

        public ReadOnlyReactiveProperty<byte> Target => _targetReactive;
        public ReadOnlyReactiveProperty<int> BlockFlags => _blockFlagsReactive;
        public ReadOnlyReactiveProperty<BuildModeSnapshot> State => _snapshotReactive;

        public byte CurrentTarget => (byte)Volatile.Read(ref _target);
        public BuildBlockFlags CurrentBlockFlags => (BuildBlockFlags)Volatile.Read(ref _blockFlags);

        public bool HasTarget => CurrentTarget != BuildTarget.None;
        public bool IsBlocked => CurrentBlockFlags != BuildBlockFlags.None;
        public bool IsActive => HasTarget && !IsBlocked;

        /// <summary>True if the controller exited build mode on the current frame. Lets sibling click handlers (e.g. AppStateController) suppress the placement click so it doesn't double-route into unit inspect/move.</summary>
        public bool ExitedThisFrame => Volatile.Read(ref _lastExitFrame) == UnityEngine.Time.frameCount;

        public BuildModeSnapshot Snapshot()
        {
            var target = (byte)Volatile.Read(ref _target);
            var flags = (BuildBlockFlags)Volatile.Read(ref _blockFlags);
            return new BuildModeSnapshot(target, flags);
        }

        public bool TryGetActiveTarget(out byte target)
        {
            var snap = Snapshot();
            target = snap.Target;
            return snap.IsActive;
        }

        public bool TryEnter(byte target)
        {
            if (Volatile.Read(ref _disposed) != 0) return false;
            if (target == BuildTarget.None) return false;

            while (true)
            {
                if (Volatile.Read(ref _blockFlags) != 0)
                    return false;

                var current = Volatile.Read(ref _target);
                if (current == target)
                    return true;

                if (Interlocked.CompareExchange(ref _target, target, current) != current)
                    continue;

                if (Volatile.Read(ref _blockFlags) != 0)
                {
                    Interlocked.CompareExchange(ref _target, BuildTarget.None, target);
                    _targetReactive.Value = (byte)Volatile.Read(ref _target);
                    return false;
                }

                PublishCurrentState();
                return true;
            }
        }

        public void Exit()
        {
            if (Volatile.Read(ref _disposed) != 0) return;

            var old = Interlocked.Exchange(ref _target, BuildTarget.None);
            if (old == BuildTarget.None) return;

            StampExitFrame();
            PublishCurrentState();
        }

        public void Toggle(byte target)
        {
            if (Volatile.Read(ref _disposed) != 0) return;
            if (target == BuildTarget.None)
            {
                Exit();
                return;
            }

            while (true)
            {
                if (Volatile.Read(ref _blockFlags) != 0)
                    return;

                var current = Volatile.Read(ref _target);
                var next = current == target ? BuildTarget.None : target;

                if (Interlocked.CompareExchange(ref _target, next, current) != current)
                    continue;

                if (next != BuildTarget.None && Volatile.Read(ref _blockFlags) != 0)
                {
                    Interlocked.CompareExchange(ref _target, BuildTarget.None, next);
                    StampExitFrame();
                    PublishCurrentState();
                    return;
                }

                if (next == BuildTarget.None) StampExitFrame();
                PublishCurrentState();
                return;
            }
        }

        public void AddBlock(BuildBlockFlags flags, bool clearTarget = true)
        {
            if (Volatile.Read(ref _disposed) != 0) return;
            if (flags == BuildBlockFlags.None) return;

            var changed = false;

            while (true)
            {
                var current = Volatile.Read(ref _blockFlags);
                var next = current | (int)flags;

                if (Interlocked.CompareExchange(ref _blockFlags, next, current) == current)
                {
                    changed = next != current;
                    break;
                }
            }

            if (clearTarget)
                Interlocked.Exchange(ref _target, BuildTarget.None);

            if (changed || clearTarget)
                PublishCurrentState();

        }

        public void RemoveBlock(BuildBlockFlags flags)
        {
            if (Volatile.Read(ref _disposed) != 0) return;
            if (flags == BuildBlockFlags.None) return;

            while (true)
            {
                var current = Volatile.Read(ref _blockFlags);
                var next = current & ~(int)flags;

                if (Interlocked.CompareExchange(ref _blockFlags, next, current) == current)
                {
                    if (next != current)
                        PublishCurrentState();
                    return;
                }
            }
        }

        public void SetBlocked(BuildBlockFlags flags, bool clearTarget = true)
        {
            if (Volatile.Read(ref _disposed) != 0) return;

            var next = (int)flags;
            var old = Interlocked.Exchange(ref _blockFlags, next);

            if (clearTarget && next != 0)
                Interlocked.Exchange(ref _target, BuildTarget.None);

            if (old != next || (clearTarget && next != 0))
                PublishCurrentState();
        }

        public void ClearBlocks()
        {
            if (Volatile.Read(ref _disposed) != 0) return;

            var old = Interlocked.Exchange(ref _blockFlags, (int)BuildBlockFlags.None);
            if (old == (int)BuildBlockFlags.None) return;

            PublishCurrentState();
        }

        public bool HasBlock(BuildBlockFlags flags)
        {
            return (CurrentBlockFlags & flags) != 0;
        }

        public void Reset()
        {
            if (Volatile.Read(ref _disposed) != 0) return;

            Interlocked.Exchange(ref _target, BuildTarget.None);
            Interlocked.Exchange(ref _blockFlags, (int)BuildBlockFlags.None);
            PublishCurrentState();
        }

        void StampExitFrame()
        {
            Volatile.Write(ref _lastExitFrame, UnityEngine.Time.frameCount);
        }

        void PublishCurrentState()
        {
            var target = (byte)Volatile.Read(ref _target);
            var flagsInt = Volatile.Read(ref _blockFlags);
            var flags = (BuildBlockFlags)flagsInt;
            var snapshot = new BuildModeSnapshot(target, flags);

            _targetReactive.Value = target;
            _blockFlagsReactive.Value = flagsInt;
            _snapshotReactive.Value = snapshot;
        }

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _disposed, 1) != 0) return;

            _snapshotReactive.Dispose();
            _targetReactive.Dispose();
            _blockFlagsReactive.Dispose();
        }
    }

    public static class BuildModeBridge
    {
        static BuildModeController _source;

        public static BuildModeController Source
        {
            get => Volatile.Read(ref _source);
            set => Volatile.Write(ref _source, value);
        }

        public static bool TryGet(out BuildModeController source)
        {
            source = Volatile.Read(ref _source);
            return source != null;
        }

        public static void Clear(BuildModeController expected = null)
        {
            if (expected == null)
            {
                Volatile.Write(ref _source, null);
                return;
            }

            Interlocked.CompareExchange(ref _source, null, expected);
        }

    }
}