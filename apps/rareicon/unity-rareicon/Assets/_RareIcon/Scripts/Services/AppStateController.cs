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

        readonly ReactiveProperty<AppInterfaceState> _state = new(AppInterfaceState.Boot);
        public ReadOnlyReactiveProperty<AppInterfaceState> Current => _state;

        // Context carried across transitions — read by HUDs after a state change.
        public HexClickedMessage LastClickedHex { get; private set; }
        public EnterTileMessage CurrentTile { get; private set; }

        IDisposable _subscriptions;

        [Inject]
        public AppStateController(
            ISubscriber<HexClickedMessage> clickSub,
            ISubscriber<EnterTileMessage> enterSub)
        {
            _clickSub = clickSub;
            _enterSub = enterSub;
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
            LastClickedHex = msg;
            _state.Value = AppInterfaceState.EnterModal;
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
