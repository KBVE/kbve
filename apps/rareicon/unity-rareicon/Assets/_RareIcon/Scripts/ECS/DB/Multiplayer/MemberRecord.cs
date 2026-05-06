using System;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Blittable peer descriptor shared between the managed coordinator side (<see cref="MultiplayerCoordinator.Members"/> as <c>ObservableList&lt;MemberRecord&gt;</c>) and the ECS gameplay side (<see cref="PlayerPeer"/> IComponentData). Burst-readable, GC-free; <see cref="FixedString64Bytes"/> covers Steam display names without managed strings. <see cref="DisplayLine"/> is the final UI-ready string composed Burst-side by <c>PlayerPeerDisplayBuildSystem</c> and pushed back through the coordinator's <c>UpdateMemberDisplayLine</c> API so <see cref="ObservableListView{TRecord, TElement}"/> bind callbacks pay only one <c>ToString()</c> at the Label boundary. Equality on <see cref="SteamId"/> only — every other field is payload that fires Replace events, not identity.</summary>
    public struct MemberRecord : IEquatable<MemberRecord>
    {
        public ulong SteamId;
        public FixedString64Bytes DisplayName;
        public FixedString128Bytes DisplayLine;
        public byte FactionId;
        public byte LocalSlot;
        public byte IsHost;

        public bool Equals(MemberRecord other) => SteamId == other.SteamId;
        public override bool Equals(object obj) => obj is MemberRecord m && Equals(m);
        public override int GetHashCode() => SteamId.GetHashCode();
        public static bool operator ==(MemberRecord a, MemberRecord b) => a.SteamId == b.SteamId;
        public static bool operator !=(MemberRecord a, MemberRecord b) => a.SteamId != b.SteamId;
    }

    /// <summary>ECS mirror of one connected peer. Blittable + Burst-iterable; queried via <see cref="EntityQuery"/> for combat attribution / faction lookups / per-peer authority gates / Burst-side display compose. Created + destroyed by <see cref="PlayerPeerMirrorSystem"/> in lockstep with the coordinator's <c>ObservableList&lt;MemberRecord&gt;</c>; <see cref="DisplayName"/> is copied from <see cref="MemberRecord.DisplayName"/> at create time so Burst producers (e.g. <c>PlayerPeerDisplayBuildSystem</c>) don't reach back into managed Steamworks calls.</summary>
    public struct PlayerPeer : IComponentData
    {
        public ulong SteamId;
        public FixedString64Bytes DisplayName;
        public byte  FactionId;
        public byte  LocalSlot;
        public byte  IsHost;
    }

    /// <summary>Singleton native lookup populated by <see cref="PlayerPeerMirrorSystem"/> so Burst hot paths (combat attribution, bandwidth quota, authority assertion) get O(1) <c>SteamId</c> → <see cref="Entity"/> resolution without an EntityQuery walk.</summary>
    public struct PlayerPeerLookupSingleton : IComponentData
    {
        public NativeParallelHashMap<ulong, Entity> Map;
    }
}
