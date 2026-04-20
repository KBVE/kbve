using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using MessagePipe;
using R3;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>
    /// Reactive state machine for the top-level UI/scene state and the
    /// single source of truth for "what does this click mean?". Equivalent
    /// to UISystem in Unity's DotsUI sample, but lives in managed
    /// VContainer land so HUDs can subscribe via R3 and clicks/enters
    /// arrive over MessagePipe.
    ///
    /// Click routing (slice 3): a raw <see cref="HexClickedMessage"/> is
    /// dispatched into one of three semantic outputs based on context —
    /// <see cref="BuildingInspectMessage"/> when the hex hosts a building,
    /// <see cref="PossessUnitMessage"/> when it hosts a Player-faction
    /// unit other than the one already controlled, or
    /// <see cref="ControlledUnitMoveMessage"/> when the player has a
    /// controlled unit and clicked an empty land hex. Build mode is its
    /// own modality and bypasses the router (BuildCommandHandler reads
    /// raw HexClickedMessage directly).
    /// </summary>
    public sealed class AppStateController : IAsyncStartable, IDisposable
    {
        readonly ISubscriber<HexClickedMessage> _clickSub;
        readonly ISubscriber<EnterTileMessage> _enterSub;
        readonly IPublisher<BuildingInspectMessage> _inspectPub;
        readonly IPublisher<PossessUnitMessage> _possessPub;
        readonly IPublisher<ControlledUnitMoveMessage> _movePub;
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
            IPublisher<BuildingInspectMessage> inspectPub,
            IPublisher<PossessUnitMessage> possessPub,
            IPublisher<ControlledUnitMoveMessage> movePub,
            BuildModeController buildMode)
        {
            _clickSub   = clickSub;
            _enterSub   = enterSub;
            _inspectPub = inspectPub;
            _possessPub = possessPub;
            _movePub    = movePub;
            _buildMode  = buildMode;
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
            // Only the world view should produce gameplay actions —
            // defends against stray clicks from underneath modals.
            if (_state.Value != AppInterfaceState.World) return;

            // Build mode is its own modality. BuildCommandHandler converts
            // the click into a BuildRequest; the router stays out of it
            // so placing a building can't also trigger possession / move.
            if (_buildMode.IsActive)
            {
                LastClickedHex = msg;
                return;
            }

            LastClickedHex = msg;

            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;

            // 1) Building? Hex tile entity carries HexOccupant pointing at
            //    the owning Building entity.
            if (TryGetBuildingAt(em, new int2(msg.Q, msg.R), out var building))
            {
                _inspectPub.Publish(new BuildingInspectMessage(building));
                return;
            }

            // 2) Possessable unit? Any Player-faction unit on this hex
            //    that isn't already the one being driven.
            if (TryGetPossessableUnitAt(em, new int2(msg.Q, msg.R), out var unit))
            {
                _possessPub.Publish(new PossessUnitMessage(unit));
                return;
            }

            // 3) Move order — only if there's actually a controlled unit
            //    AND the click is on land (open ocean is not walkable).
            if (msg.IsLand && HasControlledUnit(em))
            {
                _movePub.Publish(new ControlledUnitMoveMessage(msg.Q, msg.R));
                return;
            }

            // 4) God view, empty land — nothing to do for v1. Future:
            //    fall through to the enterable-tile modal for landmarks
            //    (HexEnterableTag check goes here once we add it).
        }

        static bool TryGetBuildingAt(EntityManager em, int2 hex, out Entity building)
        {
            building = Entity.Null;
            if (!HexHoverSystem.TryGetHexEntity(hex, out var tile)) return false;
            if (!em.HasComponent<HexOccupant>(tile)) return false;
            var occ = em.GetComponentData<HexOccupant>(tile);
            if (occ.Building == Entity.Null) return false;
            if (!em.Exists(occ.Building)) return false;
            building = occ.Building;
            return true;
        }

        // Sweep all Unit entities and find the first Player-faction one
        // standing on this hex that doesn't already carry ControlledUnitTag.
        // Cheap because units are sparse and this only runs on click.
        static bool TryGetPossessableUnitAt(EntityManager em, int2 hex, out Entity unit)
        {
            const float HexSize = 0.25f;
            unit = Entity.Null;

            var query = em.CreateEntityQuery(
                ComponentType.ReadOnly<Unit>(),
                ComponentType.ReadOnly<LocalTransform>(),
                ComponentType.ReadOnly<Faction>());
            using var arr = query.ToEntityArray(Allocator.Temp);
            for (int i = 0; i < arr.Length; i++)
            {
                var faction = em.GetComponentData<Faction>(arr[i]);
                if (faction.Value != FactionType.Player) continue;

                var t = em.GetComponentData<LocalTransform>(arr[i]);
                var unitHex = HexMeshUtil.WorldToHex(t.Position.x, t.Position.y, HexSize);
                if (!unitHex.Equals(hex)) continue;

                // Clicking the unit you already drive is a no-op (could be
                // a "deselect" later, but for v1 the toolbar Release button
                // is the explicit way to drop control).
                if (em.HasComponent<ControlledUnitTag>(arr[i])) continue;

                unit = arr[i];
                return true;
            }
            return false;
        }

        static bool HasControlledUnit(EntityManager em)
        {
            var query = em.CreateEntityQuery(ComponentType.ReadOnly<ControlledUnitTag>());
            return query.CalculateEntityCount() > 0;
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
