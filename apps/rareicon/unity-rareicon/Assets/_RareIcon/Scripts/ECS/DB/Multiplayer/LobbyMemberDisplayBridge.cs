#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS

using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Main-thread bridge that drains <see cref="LocalizedDisplay"/> payloads written Burst-side by <see cref="PlayerPeerDisplayBuildSystem"/> back into the managed <see cref="MultiplayerCoordinator.MemberList"/>. Version-gated via a <see cref="NativeHashMap{ulong, uint}"/> of last-seen <see cref="LocalizedDisplay.Version"/> per <see cref="PlayerPeer.SteamId"/> so unchanged peers cost a single equality check, no managed call. Mutation flows through <see cref="MultiplayerCoordinator.UpdateMemberDisplayLine"/> which fires Replace on the <c>ObservableList</c>; <see cref="ObservableListView{TRecord, TElement}"/> re-binds and pays exactly one <c>ToString()</c> at the Label boundary. Pattern is the reusable template for HUD / inspector / toast bridges — swap query, swap target API, same version-gate skeleton.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(PresentationSystemGroup))]
    [UpdateAfter(typeof(PlayerPeerDisplayBuildSystem))]
    public partial class LobbyMemberDisplayBridge : SystemBase
    {
        NativeHashMap<ulong, uint> _lastSeen;
        NativeHashSet<ulong> _liveScratch;

        protected override void OnCreate()
        {
            _lastSeen    = new NativeHashMap<ulong, uint>(16, Allocator.Persistent);
            _liveScratch = new NativeHashSet<ulong>(16, Allocator.Persistent);
            RequireForUpdate<PlayerPeer>();
        }

        protected override void OnUpdate()
        {
            var coord = MultiplayerAuthorityBridge.Coordinator;
            if (coord == null) return;

            _liveScratch.Clear();

            foreach (var (peerRO, displayRO) in SystemAPI.Query<RefRO<PlayerPeer>, RefRO<LocalizedDisplay>>())
            {
                ulong id = peerRO.ValueRO.SteamId;
                uint  v  = displayRO.ValueRO.Version;
                _liveScratch.Add(id);

                if (_lastSeen.TryGetValue(id, out var seen) && seen == v) continue;
                _lastSeen[id] = v;
                if (v == 0) continue;
                coord.UpdateMemberDisplayLine(id, displayRO.ValueRO.Line);
            }

            if (_lastSeen.Count > _liveScratch.Count)
            {
                using var keys = _lastSeen.GetKeyArray(Allocator.Temp);
                for (int i = 0; i < keys.Length; i++)
                    if (!_liveScratch.Contains(keys[i])) _lastSeen.Remove(keys[i]);
            }
        }

        protected override void OnDestroy()
        {
            if (_lastSeen.IsCreated)    _lastSeen.Dispose();
            if (_liveScratch.IsCreated) _liveScratch.Dispose();
        }
    }
}

#endif
