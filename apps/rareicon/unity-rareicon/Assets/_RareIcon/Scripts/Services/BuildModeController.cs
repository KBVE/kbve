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

    public readonly struct BuildModeSnapshot
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
    }

    public sealed class BuildModeController : IDisposable
    {
        readonly SynchronizedReactiveProperty<byte> _targetReactive = new(BuildTarget.None);
        readonly SynchronizedReactiveProperty<int> _blockFlagsReactive = new((int)BuildBlockFlags.None);

        int _disposed;
        int _blockFlags;
        int _target;

        public ReadOnlyReactiveProperty<byte> Target => _targetReactive;
        public ReadOnlyReactiveProperty<int> BlockFlags => _blockFlagsReactive;

        public byte CurrentTarget => (byte)Volatile.Read(ref _target);
        public BuildBlockFlags CurrentBlockFlags => (BuildBlockFlags)Volatile.Read(ref _blockFlags);

        public bool HasTarget => CurrentTarget != BuildTarget.None;
        public bool IsBlocked => CurrentBlockFlags != BuildBlockFlags.None;
        public bool IsActive => HasTarget && !IsBlocked;

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

                _targetReactive.Value = target;
                return true;
            }
        }

        public void Exit()
        {
            if (Volatile.Read(ref _disposed) != 0) return;

            var old = Interlocked.Exchange(ref _target, BuildTarget.None);
            if (old == BuildTarget.None) return;

            _targetReactive.Value = BuildTarget.None;
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
                    _targetReactive.Value = (byte)Volatile.Read(ref _target);
                    return;
                }

                _targetReactive.Value = (byte)next;
                return;
            }
        }

        public void AddBlock(BuildBlockFlags flags, bool clearTarget = true)
        {
            if (Volatile.Read(ref _disposed) != 0) return;
            if (flags == BuildBlockFlags.None) return;

            while (true)
            {
                var current = Volatile.Read(ref _blockFlags);
                var next = current | (int)flags;

                if (Interlocked.CompareExchange(ref _blockFlags, next, current) == current)
                {
                    if (next != current)
                        _blockFlagsReactive.Value = next;
                    break;
                }
            }

            if (clearTarget)
                Exit();
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
                        _blockFlagsReactive.Value = next;
                    return;
                }
            }
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

            _targetReactive.Value = BuildTarget.None;
            _blockFlagsReactive.Value = (int)BuildBlockFlags.None;
        }

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _disposed, 1) != 0) return;

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
    }
}