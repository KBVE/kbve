using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Burst-side display producer for the lobby member row. Reads <see cref="PlayerPeer"/> + the existing <see cref="LocalizedDisplay"/> payload, composes <c>"• {DisplayName}  (host)?"</c> entirely in <see cref="FixedString128Bytes"/> using <see cref="LocaleTable"/> for the localized "(host)" suffix, and bumps <see cref="LocalizedDisplay.Version"/> only when the bytes change. <see cref="LobbyMemberDisplayBridge"/> drains the change-gated payload back into managed <see cref="MultiplayerCoordinator.MemberList"/> via <see cref="MultiplayerCoordinator.UpdateMemberDisplayLine"/>, which fires Replace on the <c>ObservableList</c> so <see cref="ObservableListView{TRecord, TElement}"/> re-binds with one <c>ToString()</c> at the Label boundary. Pattern is the template for HUD / inspector / toast producers — same Burst → version → bridge → managed-mutation seam.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    [UpdateAfter(typeof(PlayerPeerMirrorSystem))]
    [BurstCompile]
    public partial struct PlayerPeerDisplayBuildSystem : ISystem
    {
        FixedString64Bytes _hostSuffixKey;

        public void OnCreate(ref SystemState state)
        {
            _hostSuffixKey = new FixedString64Bytes("lobby.host_suffix");
            state.RequireForUpdate<PlayerPeer>();
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!LocaleTable.IsReady) return;

            FixedString128Bytes hostSuffix = default;
            if (LocaleTable.TryGet(_hostSuffixKey, out var resolved))
            {
                hostSuffix.Append((FixedString32Bytes)"  ");
                hostSuffix.Append(resolved);
            }

            new ComposeJob { HostSuffix = hostSuffix }.ScheduleParallel();
        }

        [BurstCompile]
        partial struct ComposeJob : IJobEntity
        {
            public FixedString128Bytes HostSuffix;

            void Execute(in PlayerPeer peer, ref LocalizedDisplay display)
            {
                FixedString128Bytes line = default;
                line.Append((FixedString32Bytes)"• ");
                line.Append(peer.DisplayName);
                if (peer.IsHost == 1) line.Append(HostSuffix);

                if (!line.Equals(display.Line))
                {
                    display.Line = line;
                    display.Version++;
                }
            }
        }
    }
}
