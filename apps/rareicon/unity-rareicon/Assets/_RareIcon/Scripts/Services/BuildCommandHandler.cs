using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using MessagePipe;
using Unity.Entities;
using Unity.Mathematics;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>
    /// Turns hex clicks into ECS build requests while build mode is
    /// active. Listens to HexClickedMessage on the MessagePipe — when
    /// BuildModeController says we're placing something, it writes a
    /// BuildCityRequest entity into the default world and exits build
    /// mode. BuildingSpawnSystem takes it from there (validates the
    /// 7-hex claim, decrements the player's token, spawns the capital).
    ///
    /// Lives on the managed side because MessagePipe + VContainer are
    /// both managed; the one place it touches the ECS world is via a
    /// single CreateEntity + AddComponentData, which is cheap.
    /// </summary>
    public sealed class BuildCommandHandler : IAsyncStartable, IDisposable
    {
        readonly ISubscriber<HexClickedMessage> _clickSub;
        readonly BuildModeController _buildMode;

        IDisposable _subscription;

        public BuildCommandHandler(
            ISubscriber<HexClickedMessage> clickSub,
            BuildModeController buildMode)
        {
            _clickSub = clickSub;
            _buildMode = buildMode;
        }

        public UniTask StartAsync(CancellationToken cancellation)
        {
            var bag = DisposableBag.CreateBuilder();
            _clickSub.Subscribe(OnHexClicked).AddTo(bag);
            _subscription = bag.Build();
            return UniTask.CompletedTask;
        }

        void OnHexClicked(HexClickedMessage msg)
        {
            if (!_buildMode.IsActive) return;

            // Translate the BuildModeController's reactive target into
            // the BuildingType we'll stamp on the request. Kept symmetric
            // (BuildTarget.X == BuildingType.X) so future buildings just
            // add a constant in BuildingComponents and slot in here.
            byte target = _buildMode.Target.CurrentValue;
            byte buildingType = target switch
            {
                BuildTarget.Capital  => BuildingType.Capital,
                BuildTarget.Farm     => BuildingType.Farm,
                BuildTarget.Barracks => BuildingType.Barracks,
                BuildTarget.Furnace  => BuildingType.Furnace,
                _                    => BuildingType.None,
            };
            if (buildingType == BuildingType.None) return;

            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null) return;

            var em = world.EntityManager;
            var req = em.CreateEntity();
            em.AddComponentData(req, new BuildRequest
            {
                CenterHex    = new int2(msg.Q, msg.R),
                BuildingType = buildingType,
                OwnerFaction = FactionType.Player,
            });

            // Exit build mode now — whether the spawn succeeds or fails
            // the click is consumed. If the request fails (biome bad,
            // cost not met) BuildingSpawnSystem won't deduct anything and
            // the user can re-toggle build mode to try again.
            _buildMode.Exit();
        }

        public void Dispose() => _subscription?.Dispose();
    }
}
