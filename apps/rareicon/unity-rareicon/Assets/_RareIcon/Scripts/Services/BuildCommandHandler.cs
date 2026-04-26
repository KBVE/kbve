using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using MessagePipe;
using Unity.Entities;
using Unity.Mathematics;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>
    /// Converts build-mode hex clicks into ECS build requests. Only accepts clicks when build mode is active, world input is allowed, and the clicked hex is valid for placement intent.
    /// </summary>
    public sealed class BuildCommandHandler : IAsyncStartable, IDisposable
    {
        readonly ISubscriber<HexClickedMessage> _clickSub;
        readonly BuildModeController _buildMode;
        readonly AppStateController _appState;

        IDisposable _subscription;
        CancellationTokenSource _disposeCts;
        CancellationTokenSource _linkedCts;

        int _disposed;

        [Inject]
        public BuildCommandHandler(
            ISubscriber<HexClickedMessage> clickSub,
            BuildModeController buildMode,
            AppStateController appState)
        {
            _clickSub = clickSub;
            _buildMode = buildMode;
            _appState = appState;
        }

        public UniTask StartAsync(CancellationToken cancellation)
        {
            _disposeCts = new CancellationTokenSource();
            _linkedCts = CancellationTokenSource.CreateLinkedTokenSource(
                cancellation,
                _disposeCts.Token);
            var bag = DisposableBag.CreateBuilder();
            _clickSub.Subscribe(OnHexClicked).AddTo(bag);
            _subscription = bag.Build();
            return UniTask.CompletedTask;
        }

        void OnHexClicked(HexClickedMessage msg)
        {
            if (_disposed != 0) return;
            if (_linkedCts == null || _linkedCts.IsCancellationRequested) return;

            if (!_buildMode.IsActive) return;
            if (!CanAcceptBuildClick(msg)) return;

            //byte target = _buildMode.Target.CurrentValue;
            byte target = _buildMode.CurrentTarget;
            byte buildingType = BuildingDB.BuildTargetToType(target);
            if (buildingType == BuildingType.None) return;

            World world = null;
            foreach (var w in World.All)
            {
                if (!w.IsCreated) continue;
                using var q = w.EntityManager.CreateEntityQuery(ComponentType.ReadOnly<KingTag>());
                if (!q.IsEmpty) { world = w; break; }
            }
            if (world == null) world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;

            var em = world.EntityManager;
            var req = em.CreateEntity();
            em.AddComponentData(req, new BuildRequest
            {
                CenterHex = new int2(msg.Q, msg.R),
                BuildingType = buildingType,
                OwnerFaction = FactionType.Player,
            });

            _buildMode.Exit();
        }

        bool CanAcceptBuildClick(in HexClickedMessage msg)
        {
            if (!msg.IsLand) return false;

            var state = _appState.Current.CurrentValue;
            if (state != AppInterfaceState.World && state != AppInterfaceState.InTile)
                return false;

            var overlays = _appState.Overlays.CurrentValue;
            const AppOverlayFlags blocked =
                AppOverlayFlags.LockedInput |
                AppOverlayFlags.Modal |
                AppOverlayFlags.PauseMenu |
                AppOverlayFlags.Dialogue;

            return (overlays & blocked) == 0;
        }

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _disposed, 1) != 0) return;

            _disposeCts?.Cancel();
            _subscription?.Dispose();
            _linkedCts?.Dispose();
            _disposeCts?.Dispose();

            _subscription = null;
            _linkedCts = null;
            _disposeCts = null;
        }    
    }
}
