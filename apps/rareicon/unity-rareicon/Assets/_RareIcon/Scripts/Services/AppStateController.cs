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
    /// Click routing: a raw <see cref="HexClickedMessage"/> becomes one of
    /// four semantic outputs — <see cref="SelectionMoveMessage"/> when any
    /// units carry SelectedTag (bulk order wins first), else
    /// <see cref="BuildingInspectMessage"/> for a building hex,
    /// <see cref="UnitInspectMessage"/> for a Player-faction unit (opens
    /// Citizens → Roster with the clicked unit selected; possession is
    /// explicit via the Roster Possess button), or
    /// <see cref="ControlledUnitMoveMessage"/> when the player has a
    /// controlled unit and clicked empty land. Build mode is its own
    /// modality and bypasses the router.</summary>
    public sealed class AppStateController : IAsyncStartable, IDisposable
    {
        readonly ISubscriber<HexClickedMessage> _clickSub;
        readonly ISubscriber<EnterTileMessage> _enterSub;
        readonly IPublisher<BuildingInspectMessage> _inspectPub;
        readonly IPublisher<UnitInspectMessage> _unitInspectPub;
        readonly IPublisher<ControlledUnitMoveMessage> _movePub;
        readonly IPublisher<SelectionMoveMessage> _selectionMovePub;
        readonly BuildModeController _buildMode;

        readonly ReactiveProperty<AppInterfaceState> _state = new(AppInterfaceState.Boot);
        public ReadOnlyReactiveProperty<AppInterfaceState> Current => _state;

        public HexClickedMessage LastClickedHex { get; private set; }
        public EnterTileMessage CurrentTile { get; private set; }

        IDisposable _subscriptions;

        [Inject]
        public AppStateController(
            ISubscriber<HexClickedMessage> clickSub,
            ISubscriber<EnterTileMessage> enterSub,
            IPublisher<BuildingInspectMessage> inspectPub,
            IPublisher<UnitInspectMessage> unitInspectPub,
            IPublisher<ControlledUnitMoveMessage> movePub,
            IPublisher<SelectionMoveMessage> selectionMovePub,
            BuildModeController buildMode)
        {
            _clickSub         = clickSub;
            _enterSub         = enterSub;
            _inspectPub       = inspectPub;
            _unitInspectPub   = unitInspectPub;
            _movePub          = movePub;
            _selectionMovePub = selectionMovePub;
            _buildMode        = buildMode;
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
            if (_state.Value != AppInterfaceState.World) return;

            if (_buildMode.IsActive)
            {
                LastClickedHex = msg;
                return;
            }

            LastClickedHex = msg;

            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;

            if (msg.IsLand && HasSelection(em))
            {
                _selectionMovePub.Publish(new SelectionMoveMessage(msg.Q, msg.R));
                return;
            }

            if (TryGetBuildingAt(em, new int2(msg.Q, msg.R), out var building))
            {
                _inspectPub.Publish(new BuildingInspectMessage(building));
                return;
            }

            if (TryGetUnitAt(em, new int2(msg.Q, msg.R), out var unit))
            {
                _unitInspectPub.Publish(new UnitInspectMessage(unit));
                return;
            }

            if (msg.IsLand && HasControlledUnit(em))
            {
                _movePub.Publish(new ControlledUnitMoveMessage(msg.Q, msg.R));
                return;
            }
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

        static bool TryGetUnitAt(EntityManager em, int2 hex, out Entity unit)
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

        static bool HasSelection(EntityManager em)
        {
            var query = em.CreateEntityQuery(ComponentType.ReadOnly<SelectedTag>());
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
