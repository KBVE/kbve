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
    public enum AppInterfaceState : byte
    {
        Boot,
        Loading,
        MainMenu,
        EnterModal,

        Connecting,
        Lobby,
        WorldLoading,

        World,
        InTile,

        Reconnecting,
        Disconnected,
        Error
    }

    [Flags]
    public enum AppOverlayFlags : ushort
    {
        None        = 0,
        Inventory   = 1 << 0,
        Dialogue    = 1 << 1,
        Map         = 1 << 2,
        Modal       = 1 << 3,
        LockedInput = 1 << 4,
        PauseMenu   = 1 << 5,
        NetworkLost = 1 << 6,
    }

    /// <summary>
    /// Reactive state machine for the top-level UI/scene state and the
    /// single source of truth for "what does this click mean?".
    ///
    /// AppInterfaceState is the coarse-grained lifecycle/mode:
    /// Boot, Loading, World, Reconnecting, etc.
    ///
    /// AppOverlayFlags are orthogonal UI layers stacked on top of the
    /// current state: Inventory, Dialogue, LockedInput, Modal, etc.
    ///
    /// Click routing:
    /// - SelectionMoveMessage when any units carry SelectedTag
    /// - BuildingInspectMessage for a building hex
    /// - UnitInspectMessage for a Player-faction unit
    /// - ControlledUnitMoveMessage when a controlled unit clicks empty land
    ///
    /// Build mode is treated as its own modality and bypasses the normal
    /// click router.
    /// </summary>
    public sealed class AppStateController : IAsyncStartable, IDisposable
    {
        readonly ISubscriber<HexClickedMessage> _clickSub;
        readonly ISubscriber<EnterTileMessage> _enterSub;
        readonly IPublisher<BuildingInspectMessage> _inspectPub;
        readonly IPublisher<LandmarkInspectMessage> _landmarkInspectPub;
        readonly IPublisher<UnitInspectMessage> _unitInspectPub;
        readonly IPublisher<ControlledUnitMoveMessage> _movePub;
        readonly IPublisher<SelectionMoveMessage> _selectionMovePub;
        readonly BuildModeController _buildMode;

        readonly SynchronizedReactiveProperty<AppInterfaceState> _state =
            new(AppInterfaceState.Boot);

        readonly SynchronizedReactiveProperty<AppOverlayFlags> _overlays =
            new(AppOverlayFlags.None);

        public ReadOnlyReactiveProperty<AppInterfaceState> Current => _state;
        public ReadOnlyReactiveProperty<AppOverlayFlags> Overlays => _overlays;

        public HexClickedMessage LastClickedHex { get; private set; }
        public EnterTileMessage CurrentTile { get; private set; }

        IDisposable _subscriptions;

        [Inject]
        public AppStateController(
            ISubscriber<HexClickedMessage> clickSub,
            ISubscriber<EnterTileMessage> enterSub,
            IPublisher<BuildingInspectMessage> inspectPub,
            IPublisher<LandmarkInspectMessage> landmarkInspectPub,
            IPublisher<UnitInspectMessage> unitInspectPub,
            IPublisher<ControlledUnitMoveMessage> movePub,
            IPublisher<SelectionMoveMessage> selectionMovePub,
            BuildModeController buildMode)
        {
            _clickSub = clickSub;
            _enterSub = enterSub;
            _inspectPub = inspectPub;
            _landmarkInspectPub = landmarkInspectPub;
            _unitInspectPub = unitInspectPub;
            _movePub = movePub;
            _selectionMovePub = selectionMovePub;
            _buildMode = buildMode;
        }

        public UniTask StartAsync(CancellationToken cancellation)
        {
            SetState(AppInterfaceState.MainMenu);
            SetOverlay(AppOverlayFlags.None);

            var bag = MessagePipe.DisposableBag.CreateBuilder();
            _clickSub.Subscribe(OnHexClicked).AddTo(bag);
            _enterSub.Subscribe(OnEnterTile).AddTo(bag);
            _subscriptions = bag.Build();

            return UniTask.CompletedTask;
        }

        void OnHexClicked(HexClickedMessage msg)
        {
            if (!AcceptsWorldClicks())
                return;

            LastClickedHex = msg;

            if (_buildMode.IsActive)
                return;

            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated)
                return;

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

            if (TryGetLandmarkAt(em, new int2(msg.Q, msg.R), out var landmark))
            {
                _inspectPub.Publish(new BuildingInspectMessage(landmark));
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
            }
        }

        void OnEnterTile(EnterTileMessage msg)
        {
            CurrentTile = msg;
            SetState(AppInterfaceState.InTile);
        }

        public void RequestExitToWorld()
        {
            SetState(AppInterfaceState.World);
        }

        public void EnterWorld()
        {
            SetState(AppInterfaceState.World);
        }

        public void EnterLobby()
        {
            SetState(AppInterfaceState.Lobby);
        }

        public void BeginConnecting()
        {
            SetState(AppInterfaceState.Connecting);
            RemoveOverlay(AppOverlayFlags.NetworkLost | AppOverlayFlags.Modal | AppOverlayFlags.LockedInput);
        }

        public void BeginReconnecting()
        {
            SetState(AppInterfaceState.Reconnecting);
            AddOverlay(AppOverlayFlags.NetworkLost | AppOverlayFlags.Modal | AppOverlayFlags.LockedInput);
        }

        public void MarkDisconnected()
        {
            SetState(AppInterfaceState.Disconnected);
            AddOverlay(AppOverlayFlags.NetworkLost | AppOverlayFlags.Modal | AppOverlayFlags.LockedInput);
        }

        public void MarkError()
        {
            SetState(AppInterfaceState.Error);
            AddOverlay(AppOverlayFlags.Modal | AppOverlayFlags.LockedInput);
        }

        public void OpenInventory()
        {
            AddOverlay(AppOverlayFlags.Inventory | AppOverlayFlags.LockedInput);
        }

        public void CloseInventory()
        {
            RemoveOverlay(AppOverlayFlags.Inventory | AppOverlayFlags.LockedInput);
        }

        public void OpenDialogue()
        {
            AddOverlay(AppOverlayFlags.Dialogue | AppOverlayFlags.LockedInput);
        }

        public void CloseDialogue()
        {
            RemoveOverlay(AppOverlayFlags.Dialogue | AppOverlayFlags.LockedInput);
        }

        public void OpenMap()
        {
            AddOverlay(AppOverlayFlags.Map);
        }

        public void CloseMap()
        {
            RemoveOverlay(AppOverlayFlags.Map);
        }

        public void OpenPauseMenu()
        {
            AddOverlay(AppOverlayFlags.PauseMenu | AppOverlayFlags.Modal | AppOverlayFlags.LockedInput);
        }

        public void ClosePauseMenu()
        {
            RemoveOverlay(AppOverlayFlags.PauseMenu | AppOverlayFlags.Modal | AppOverlayFlags.LockedInput);
        }

        public bool CanAcceptWorldInput()
        {
            var state = _state.CurrentValue;
            if (state != AppInterfaceState.World && state != AppInterfaceState.InTile)
                return false;

            const AppOverlayFlags blocked =
                AppOverlayFlags.LockedInput |
                AppOverlayFlags.Modal |
                AppOverlayFlags.Dialogue |
                AppOverlayFlags.PauseMenu;

            return (_overlays.CurrentValue & blocked) == 0;
        }

        /// <summary>
        /// Clears all transient UI overlays (inventory, dialogue, map, modal, etc.) while preserving persistent overlays such as network/disconnect state.
        /// </summary>
        public void ClearTransientUi()
        {
            RemoveOverlay(
                AppOverlayFlags.Inventory |
                AppOverlayFlags.Dialogue |
                AppOverlayFlags.Map |
                AppOverlayFlags.Modal |
                AppOverlayFlags.LockedInput |
                AppOverlayFlags.PauseMenu);
        }

        /// <summary>
        /// Clears all overlay flags except the ones specified in <paramref name="keep"/>. Uses bitmask <see cref="AppOverlayFlags"/> filtering to retain only the provided flags.
        /// </summary>
        /// <param name="keep">Overlay flags that should remain active.</param>
        public void ClearAllExcept(AppOverlayFlags keep)
        {
            SetOverlay(_overlays.CurrentValue & keep);
        }

        bool AcceptsWorldClicks()
        {
            var state = _state.CurrentValue;
            if (state != AppInterfaceState.World && state != AppInterfaceState.InTile)
                return false;

            if (HasOverlay(AppOverlayFlags.LockedInput))
                return false;

            if (HasOverlay(AppOverlayFlags.Modal))
                return false;

            if (HasOverlay(AppOverlayFlags.PauseMenu))
                return false;

            return true;
        }

        void SetState(AppInterfaceState next)
        {
            if (_state.CurrentValue == next)
                return;

            _state.Value = next;
        }

        void SetOverlay(AppOverlayFlags flags)
        {
            if (_overlays.CurrentValue == flags)
                return;

            _overlays.Value = flags;
        }

        void AddOverlay(AppOverlayFlags flags)
        {
            var next = _overlays.CurrentValue | flags;
            if (_overlays.CurrentValue == next)
                return;

            _overlays.Value = next;
        }

        void RemoveOverlay(AppOverlayFlags flags)
        {
            var next = _overlays.CurrentValue & ~flags;
            if (_overlays.CurrentValue == next)
                return;

            _overlays.Value = next;
        }

        bool HasOverlay(AppOverlayFlags flags)
        {
            return (_overlays.CurrentValue & flags) == flags;
        }

        static bool TryGetBuildingAt(EntityManager em, int2 hex, out Entity building)
        {
            building = Entity.Null;

            if (!HexHoverSystem.TryGetHexEntity(hex, out var tile))
                return false;

            if (!em.HasComponent<HexOccupant>(tile))
                return false;

            var occ = em.GetComponentData<HexOccupant>(tile);

            if (occ.Building == Entity.Null)
                return false;

            if (!em.Exists(occ.Building))
                return false;

            building = occ.Building;
            return true;
        }

        static bool TryGetLandmarkAt(EntityManager em, int2 hex, out Entity landmark)
        {
            landmark = Entity.Null;
            var query = em.CreateEntityQuery(ComponentType.ReadOnly<Landmark>());
            using var arr = query.ToEntityArray(Allocator.Temp);
            for (int i = 0; i < arr.Length; i++)
            {
                var lm = em.GetComponentData<Landmark>(arr[i]);
                if (lm.RootHex.Equals(hex)) { landmark = arr[i]; return true; }
            }
            return false;
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
                if (faction.Value != FactionType.Player)
                    continue;

                var t = em.GetComponentData<LocalTransform>(arr[i]);
                var unitHex = HexMeshUtil.WorldToHex(t.Position.x, t.Position.y, HexSize);
                if (!unitHex.Equals(hex))
                    continue;

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

        public void Dispose()
        {
            _subscriptions?.Dispose();
            _state?.Dispose();
            _overlays?.Dispose();
        }
    }
}