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
        Error,

        GameOver,
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

        readonly SynchronizedReactiveProperty<AppMask> _mask =
            new(AppMask.Boot);

        readonly SynchronizedReactiveProperty<TitleSection> _section =
            new(TitleSection.MainMenu);

        readonly SynchronizedReactiveProperty<AppOverlayFlags> _overlays =
            new(AppOverlayFlags.None);

        public ReadOnlyReactiveProperty<AppInterfaceState> Current => _state;
        /// <summary>Bitwise mirror of <see cref="Current"/>. Subscribers that want to gate on a group of phases (e.g. World+InTile) should bind to this instead of doing two-way enum equality. Always coherent with <see cref="Current"/>: both are republished from the same setter.</summary>
        public ReadOnlyReactiveProperty<AppMask> CurrentMask => _mask;
        /// <summary>Active title-screen section (left-rail tab). Independent of <see cref="Current"/> so the section selection survives <see cref="AppMask.MainMenu"/> ⇄ <see cref="AppMask.Lobby"/> hops; UI surfaces gate visibility on `(section &amp; MyTab) != 0` and stop touching sibling display styles. Defaults to <see cref="TitleSection.MainMenu"/> on boot.</summary>
        public ReadOnlyReactiveProperty<TitleSection> CurrentSection => _section;
        public ReadOnlyReactiveProperty<AppOverlayFlags> Overlays => _overlays;

        /// <summary>Convenience for `(CurrentMask &amp; any) != 0`. Cheaper than the property-chain when checking from a hot path.</summary>
        public bool Has(AppMask any) => (_mask.CurrentValue & any) != 0;

        /// <summary>Convenience for `(CurrentSection &amp; any) != 0`.</summary>
        public bool Has(TitleSection any) => (_section.CurrentValue & any) != 0;

        /// <summary>Switch the active title-screen section (single-bit-active). Clears every other section bit and sets the requested one. Idempotent — same section is a no-op. Does not change <see cref="Current"/> / <see cref="CurrentMask"/>; section is orthogonal to app phase.</summary>
        public void SwitchSection(TitleSection section)
        {
            if (_section.CurrentValue == section) return;
            _section.Value = section;
        }

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

            if (_buildMode.IsActive || _buildMode.ExitedThisFrame)
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

        /// <summary>Capital was destroyed — switch into the GameOver state with a locked-input modal overlay so the loss screen owns input until the player picks Return to Title.</summary>
        public void EnterGameOver()
        {
            if (_state.Value == AppInterfaceState.GameOver) return;
            SetState(AppInterfaceState.GameOver);
            AddOverlay(AppOverlayFlags.Modal | AppOverlayFlags.LockedInput);
        }

        /// <summary>Return to title from any in-run state — tears down the active world (stops Rust empire ticker, destroys gameplay entities, resets <see cref="WorldGenSession"/>) so the title screen sees a clean slate, then flips state. Also resets <see cref="CurrentSection"/> to <see cref="TitleSection.MainMenu"/> so the rail returns to the welcome state instead of leaving (e.g.) Multiplayer highlighted after a Leave Lobby.</summary>
        public void ReturnToMainMenu()
        {
            WorldResetBridge.Source?.Reset();
            SetOverlay(AppOverlayFlags.None);
            SetState(AppInterfaceState.MainMenu);
            SwitchSection(TitleSection.MainMenu);
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
            _mask.Value  = next.ToMask();
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

        static EntityQuery _hashQuery;
        static EntityQuery _linearQuery;
        static bool        _hashQueryReady;
        static bool        _linearQueryReady;

        static bool TryGetUnitAt(EntityManager em, int2 hex, out Entity unit)
        {
            const float HexSize = 0.25f;
            unit = Entity.Null;

            float3 hexCenter = HexMeshUtil.HexToWorld(hex.x, hex.y, HexSize);
            float2 click     = new float2(hexCenter.x, hexCenter.y);

            if (!_hashQueryReady)
            {
                _hashQuery = em.CreateEntityQuery(ComponentType.ReadOnly<SpatialHashSingleton>());
                _hashQueryReady = true;
            }
            if (_hashQuery.CalculateEntityCount() == 0)
                return TryGetUnitAtLinear(em, hex, out unit);

            var snap = _hashQuery.GetSingleton<SpatialHashSingleton>();

            snap.WriteHandle.Complete();
            var hash = snap.Hash;
            if (!hash.IsCreated) return TryGetUnitAtLinear(em, hex, out unit);

            int cx = (int)math.floor(click.x / SpatialHashSystem.CellSize);
            int cy = (int)math.floor(click.y / SpatialHashSystem.CellSize);

            for (int dy = -1; dy <= 1; dy++)
            for (int dx = -1; dx <= 1; dx++)
            {
                int key = SpatialHashSystem.CellKey(cx + dx, cy + dy);
                if (!hash.TryGetFirstValue(key, out var hit, out var iter)) continue;
                do
                {
                    if (hit.Faction != FactionType.Player) continue;
                    if (!em.Exists(hit.Entity))             continue;

                    var hexAt = HexMeshUtil.WorldToHex(hit.Position.x, hit.Position.y, HexSize);
                    if (!hexAt.Equals(hex)) continue;

                    unit = hit.Entity;
                    return true;
                }
                while (hash.TryGetNextValue(out hit, ref iter));
            }
            return false;
        }

        /// <summary>Fallback linear scan over <see cref="Unit"/> + <see cref="Faction"/> for the rare frame where the spatial-hash singleton hasn't been published yet (e.g. very first frame after world bootstrap, before <see cref="SpatialHashSystem"/> ran). Cheaper to keep the safety net than to gate every world click on hash readiness.</summary>
        static bool TryGetUnitAtLinear(EntityManager em, int2 hex, out Entity unit)
        {
            const float HexSize = 0.25f;
            unit = Entity.Null;
            if (!_linearQueryReady)
            {
                _linearQuery = em.CreateEntityQuery(
                    ComponentType.ReadOnly<Unit>(),
                    ComponentType.ReadOnly<LocalTransform>(),
                    ComponentType.ReadOnly<Faction>());
                _linearQueryReady = true;
            }
            using var arr = _linearQuery.ToEntityArray(Allocator.Temp);
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

        public void Dispose()
        {
            _subscriptions?.Dispose();
            _state?.Dispose();
            _mask?.Dispose();
            _section?.Dispose();
            _overlays?.Dispose();
        }
    }
}