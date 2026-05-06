#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS

using System.Collections.Concurrent;
using ObservableCollections;
using R3;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>ECS mirror of <see cref="MultiplayerCoordinator.MemberList"/>. Subscribes to the managed <see cref="ObservableList{T}"/> via R3 deltas, queues them onto a thread-safe <see cref="ConcurrentQueue{T}"/>, and drains on OnUpdate (main thread) so entity create/destroy + the <see cref="PlayerPeerLookupSingleton"/> map stay world-thread-safe regardless of which thread Steam / NetCode / future Rust empire ticker emits from. Maintains 1:1 invariant between <see cref="MemberRecord"/> and an entity carrying <see cref="PlayerPeer"/>.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(InitializationSystemGroup), OrderFirst = true)]
    [UpdateAfter(typeof(MultiplayerSessionBridge))]
    public partial class PlayerPeerMirrorSystem : SystemBase
    {
        enum DeltaKind : byte { Add, Remove, Replace, Reset }

        readonly struct Delta
        {
            public readonly DeltaKind Kind;
            public readonly MemberRecord Value;
            public Delta(DeltaKind k, MemberRecord v) { Kind = k; Value = v; }
        }

        readonly ConcurrentQueue<Delta> _pending = new();
        readonly CompositeDisposable _disposables = new();

        Entity _lookupSingleton;
        NativeParallelHashMap<ulong, Entity> _map;
        ObservableList<MemberRecord> _attached;

        protected override void OnCreate()
        {
            _map = new NativeParallelHashMap<ulong, Entity>(16, Allocator.Persistent);
            _lookupSingleton = EntityManager.CreateEntity(typeof(PlayerPeerLookupSingleton));
            EntityManager.SetName(_lookupSingleton, "PlayerPeerLookup");
            EntityManager.SetComponentData(_lookupSingleton, new PlayerPeerLookupSingleton { Map = _map });
        }

        protected override void OnUpdate()
        {
            EnsureSubscribed();
            if (_pending.IsEmpty) return;

            while (_pending.TryDequeue(out var d))
            {
                switch (d.Kind)
                {
                    case DeltaKind.Add:     ApplyAdd(d.Value);      break;
                    case DeltaKind.Remove:  ApplyRemove(d.Value);   break;
                    case DeltaKind.Replace: ApplyReplace(d.Value);  break;
                    case DeltaKind.Reset:   ApplyReset();           break;
                }
            }
        }

        void EnsureSubscribed()
        {
            var coord = MultiplayerAuthorityBridge.Coordinator;
            if (coord == null) return;
            var list = coord.MemberList;
            if (_attached == list) return;

            _disposables.Clear();
            _attached = list;
            _pending.Enqueue(new Delta(DeltaKind.Reset, default));
            foreach (var rec in list) _pending.Enqueue(new Delta(DeltaKind.Add, rec));

            list.ObserveAdd().Subscribe(ev => _pending.Enqueue(new Delta(DeltaKind.Add, ev.Value))).AddTo(_disposables);
            list.ObserveRemove().Subscribe(ev => _pending.Enqueue(new Delta(DeltaKind.Remove, ev.Value))).AddTo(_disposables);
            list.ObserveReplace().Subscribe(ev => _pending.Enqueue(new Delta(DeltaKind.Replace, ev.NewValue))).AddTo(_disposables);
            list.ObserveReset().Subscribe(_ => _pending.Enqueue(new Delta(DeltaKind.Reset, default))).AddTo(_disposables);
        }

        void ApplyAdd(MemberRecord rec)
        {
            if (_map.ContainsKey(rec.SteamId)) { ApplyReplace(rec); return; }
            var e = EntityManager.CreateEntity(typeof(PlayerPeer), typeof(LocalizedDisplay));
            EntityManager.SetName(e, $"PlayerPeer:{rec.SteamId}");
            EntityManager.SetComponentData(e, ToComponent(rec));
            EntityManager.SetComponentData(e, new LocalizedDisplay { Line = default, Version = 0 });
            _map.Add(rec.SteamId, e);
        }

        void ApplyRemove(MemberRecord rec)
        {
            if (!_map.TryGetValue(rec.SteamId, out var e)) return;
            _map.Remove(rec.SteamId);
            if (EntityManager.Exists(e)) EntityManager.DestroyEntity(e);
        }

        void ApplyReplace(MemberRecord rec)
        {
            if (!_map.TryGetValue(rec.SteamId, out var e) || !EntityManager.Exists(e))
            {
                ApplyAdd(rec);
                return;
            }
            EntityManager.SetComponentData(e, ToComponent(rec));
        }

        void ApplyReset()
        {
            using (var keys = _map.GetKeyArray(Allocator.Temp))
            {
                for (int i = 0; i < keys.Length; i++)
                {
                    if (_map.TryGetValue(keys[i], out var e) && EntityManager.Exists(e))
                        EntityManager.DestroyEntity(e);
                }
            }
            _map.Clear();
        }

        static PlayerPeer ToComponent(MemberRecord r) => new PlayerPeer
        {
            SteamId     = r.SteamId,
            DisplayName = r.DisplayName,
            FactionId   = r.FactionId,
            LocalSlot   = r.LocalSlot,
            IsHost      = r.IsHost,
        };

        protected override void OnDestroy()
        {
            _disposables?.Dispose();
            ApplyReset();
            if (_map.IsCreated) _map.Dispose();
            if (EntityManager.Exists(_lookupSingleton)) EntityManager.DestroyEntity(_lookupSingleton);
        }
    }
}

#endif
