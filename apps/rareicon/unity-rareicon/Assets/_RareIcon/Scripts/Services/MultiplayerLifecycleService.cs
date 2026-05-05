#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS

using System;
using MessagePipe;
using R3;
using RareIcon.Platform;
using RareIcon.Platform.Netcode;
using UnityEngine;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Phase 2b — owns the transport lifecycle for an active multiplayer match. Listens for AppState transitions into <see cref="AppInterfaceState.World"/> while the lobby reports <c>started=1</c>; on match start it boots <see cref="SteamPacketBridge"/> so Unity Transport's Burst jobs can hand packets off to <see cref="SteamNetworkingService"/>. On match end / lobby leave / Return-to-Title it tears the bridge down so background queues don't leak across runs.
    ///
    /// NetCode connect / listen requests (<c>NetworkStreamRequestConnect</c> / <c>NetworkStreamRequestListen</c>) plug in next pass — bridge initialization is the prerequisite + this service owns its lifecycle so the wire-up only has to add the request entity.
    /// </summary>
    public sealed class MultiplayerLifecycleService : IStartable, IDisposable
    {
        readonly MultiplayerCoordinator _coord;
        readonly AppStateController     _appState;
        readonly ISubscriber<SteamLobbyDataChangedMessage> _subData;
        readonly ISubscriber<SteamLobbyLeftMessage>        _subLeft;

        readonly CompositeDisposable _disposables = new();
        bool _bridgeUp;

        [Inject]
        public MultiplayerLifecycleService(
            MultiplayerCoordinator coord,
            AppStateController appState,
            ISubscriber<SteamLobbyDataChangedMessage> subData,
            ISubscriber<SteamLobbyLeftMessage>        subLeft)
        {
            _coord    = coord;
            _appState = appState;
            _subData  = subData;
            _subLeft  = subLeft;
        }

        public void Start()
        {
            var bag = MessagePipe.DisposableBag.CreateBuilder();
            _subData.Subscribe(_ => MaybeStart()).AddTo(bag);
            _subLeft.Subscribe(_ => Stop()).AddTo(bag);
            _disposables.Add(bag.Build());

            _appState.Current
                .Subscribe(state => { if (state == AppInterfaceState.MainMenu) Stop(); })
                .AddTo(_disposables);
        }

        public void Dispose()
        {
            Stop();
            _disposables?.Dispose();
        }

        // -- Bridge lifecycle --

        void MaybeStart()
        {
            if (_bridgeUp) return;
            if (!_coord.InLobby) return;

            // Lobby data carries a `started` flag the host flips when
            // launching the match. Until that's set we stay idle so a
            // peer browsing the lobby UI doesn't allocate transport
            // queues prematurely.
            if (!IsMatchStarted()) return;

            try
            {
                SteamPacketBridge.Initialize();
                _bridgeUp = true;
                Debug.Log($"[MultiplayerLifecycle] transport bridge online — host={_coord.IsHost.CurrentValue} mode={_coord.Mode.CurrentValue}");
            }
            catch (Exception e)
            {
                Debug.LogError($"[MultiplayerLifecycle] failed to initialise SteamPacketBridge: {e.Message}");
            }
        }

        void Stop()
        {
            if (!_bridgeUp) return;
            try
            {
                SteamPacketBridge.Shutdown();
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[MultiplayerLifecycle] error shutting down SteamPacketBridge: {e.Message}");
            }
            _bridgeUp = false;
        }

        bool IsMatchStarted()
        {
            // MultiplayerCoordinator already gates on this internally;
            // the indirect check via lobby data keeps the lifecycle
            // service decoupled from coordinator internals so it can
            // drive transport even if the coordinator API evolves.
            return MultiplayerAuthorityBridge.Lobby?.GetData(LobbyDataKeys.Started) == "1";
        }
    }
}

#endif
