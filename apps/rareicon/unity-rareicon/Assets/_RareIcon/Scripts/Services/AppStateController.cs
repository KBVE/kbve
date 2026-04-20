using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using MessagePipe;
using R3;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>
    /// Reactive state machine for the top-level UI/scene state.
    /// Equivalent to UISystem in Unity's DotsUI sample, but lives in managed
    /// VContainer land so HUDs can subscribe via R3 and clicks/enters arrive
    /// over MessagePipe.
    ///
    /// Owns AppInterfaceState transitions; HUDs gate themselves on Current.
    /// </summary>
    public sealed class AppStateController : IAsyncStartable, IDisposable
    {
        readonly ISubscriber<HexClickedMessage> _clickSub;
        readonly ISubscriber<EnterTileMessage> _enterSub;
        readonly BuildModeController _buildMode;

        readonly ReactiveProperty<AppInterfaceState> _state = new(AppInterfaceState.Boot);
        public ReadOnlyReactiveProperty<AppInterfaceState> Current => _state;

        // Context carried across transitions — read by HUDs after a state change.
        public HexClickedMessage LastClickedHex { get; private set; }
        public EnterTileMessage CurrentTile { get; private set; }

        IDisposable _subscriptions;

        [Inject]
        public AppStateController(
            ISubscriber<HexClickedMessage> clickSub,
            ISubscriber<EnterTileMessage> enterSub,
            BuildModeController buildMode)
        {
            _clickSub = clickSub;
            _enterSub = enterSub;
            _buildMode = buildMode;
        }

        public UniTask StartAsync(CancellationToken cancellation)
        {
            _state.Value = AppInterfaceState.World;

            var bag = MessagePipe.DisposableBag.CreateBuilder();
            _clickSub.Subscribe(OnHexClicked).AddTo(bag);
            _enterSub.Subscribe(OnEnterTile).AddTo(bag);
            _subscriptions = bag.Build();

            return UniTask.CompletedTask;
        }

        void OnHexClicked(HexClickedMessage msg)
        {
            // Only the world view can spawn the enter modal — defends against
            // stray clicks from underneath modals or in-tile views.
            if (_state.Value != AppInterfaceState.World) return;
            // Build mode steals clicks — BuildCommandHandler turns the click
            // into a BuildCityRequest. Skip the enter-modal transition so
            // placing a building doesn't also open the tile modal.
            if (_buildMode.IsActive) return;
            // General-map clicks no longer auto-open the enter modal — most
            // clicks are now King movement orders (KingMoveCommandSystem).
            // TODO: re-fire the modal from systems whose hexes carry an
            // "enterable" feature (buildings, landmark NPCs, dungeons).
            // For that, gate on something like:
            //   HexHoverSystem.TryGetHexEntity(...) → check HasComponent<HexEnterableTag>
            // Keep LastClickedHex updated for any other consumer that might
            // want it (e.g., a future build-mode preview).
            LastClickedHex = msg;
        }

        void OnEnterTile(EnterTileMessage msg)
        {
            CurrentTile = msg;
            _state.Value = AppInterfaceState.InTile;
        }

        public void RequestExitToWorld()
        {
            _state.Value = AppInterfaceState.World;
        }

        public void Dispose()
        {
            _subscriptions?.Dispose();
            _state?.Dispose();
        }
    }
}
