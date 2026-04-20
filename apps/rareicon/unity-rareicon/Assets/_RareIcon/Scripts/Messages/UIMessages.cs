namespace RareIcon
{
    // -- Locale --

    public readonly struct LocaleChangedMessage
    {
        public readonly string Locale;
        public LocaleChangedMessage(string locale) => Locale = locale;
    }

    // -- Hex hover --

    public readonly struct HexHoverMessage
    {
        public readonly int Q;
        public readonly int R;
        public readonly byte BiomeId;
        public readonly bool IsLand;
        public readonly byte Wood, Stone, Berries, Mushrooms, Herbs;
        public readonly byte Cactus;
        public readonly byte CactusVariant;
        public readonly byte UnitType;
        public readonly float UnitHealth,  UnitMaxHealth;
        public readonly float UnitEnergy,  UnitMaxEnergy;
        public readonly float UnitMana,    UnitMaxMana;
        public readonly float UnitHunger,  UnitMaxHunger;
        public readonly float UnitFatigue, UnitMaxFatigue;
        public readonly ushort UnitInvId0, UnitInvCount0;
        public readonly ushort UnitInvId1, UnitInvCount1;
        public readonly ushort UnitInvId2, UnitInvCount2;
        public readonly ushort UnitInvId3, UnitInvCount3;

        public HexHoverMessage(int q, int r, byte biomeId, bool isLand,
                               byte wood = 0, byte stone = 0, byte berries = 0,
                               byte mushrooms = 0, byte herbs = 0,
                               byte cactus = 0, byte cactusVariant = 0,
                               byte unitType = 0,
                               float unitHealth = 0,  float unitMaxHealth = 0,
                               float unitEnergy = 0,  float unitMaxEnergy = 0,
                               float unitMana   = 0,  float unitMaxMana   = 0,
                               float unitHunger = 0,  float unitMaxHunger = 0,
                               float unitFatigue = 0, float unitMaxFatigue = 0,
                               ushort invId0 = 0, ushort invCount0 = 0,
                               ushort invId1 = 0, ushort invCount1 = 0,
                               ushort invId2 = 0, ushort invCount2 = 0,
                               ushort invId3 = 0, ushort invCount3 = 0)
        {
            Q = q;
            R = r;
            BiomeId = biomeId;
            IsLand = isLand;
            Wood = wood;
            Stone = stone;
            Berries = berries;
            Mushrooms = mushrooms;
            Herbs = herbs;
            Cactus = cactus;
            CactusVariant = cactusVariant;
            UnitType = unitType;
            UnitHealth     = unitHealth;
            UnitMaxHealth  = unitMaxHealth;
            UnitEnergy     = unitEnergy;
            UnitMaxEnergy  = unitMaxEnergy;
            UnitMana       = unitMana;
            UnitMaxMana    = unitMaxMana;
            UnitHunger     = unitHunger;
            UnitMaxHunger  = unitMaxHunger;
            UnitFatigue    = unitFatigue;
            UnitMaxFatigue = unitMaxFatigue;
            UnitInvId0 = invId0; UnitInvCount0 = invCount0;
            UnitInvId1 = invId1; UnitInvCount1 = invCount1;
            UnitInvId2 = invId2; UnitInvCount2 = invCount2;
            UnitInvId3 = invId3; UnitInvCount3 = invCount3;
        }
    }

    public readonly struct HexClickedMessage
    {
        public readonly int Q;
        public readonly int R;
        public readonly byte BiomeId;
        public readonly bool IsLand;

        public HexClickedMessage(int q, int r, byte biomeId, bool isLand)
        {
            Q = q;
            R = r;
            BiomeId = biomeId;
            IsLand = isLand;
        }
    }

    public readonly struct EnterTileMessage
    {
        public readonly int Q;
        public readonly int R;
        public readonly byte BiomeId;

        public EnterTileMessage(int q, int r, byte biomeId)
        {
            Q = q;
            R = r;
            BiomeId = biomeId;
        }
    }

    public readonly struct PanelShowMessage
    {
        public readonly string PanelKey;
        public PanelShowMessage(string panelKey) => PanelKey = panelKey;
    }

    public readonly struct PanelHideMessage
    {
        public readonly string PanelKey;
        public PanelHideMessage(string panelKey) => PanelKey = panelKey;
    }

    /// <summary>Severity of a toast — drives the panel border tint.</summary>
    public enum ToastKind : byte
    {
        Info    = 0,
        Success = 1,
        Warning = 2,
        Error   = 3,
    }

    /// <summary>
    /// Player-facing notification published by gameplay systems and
    /// consumed by ToastService which queues + displays them serially.
    /// </summary>
    public readonly struct ToastMessage
    {
        public readonly ToastKind Kind;
        public readonly string Text;
        public ToastMessage(string text, ToastKind kind = ToastKind.Info)
        {
            Kind = kind;
            Text = text;
        }
    }

    // -- Click router output (AppStateController emits one of these
    //    per left-click after deciding what the click MEANS) --

    /// <summary>"Player clicked a building hex" — Building Inspector panel target.</summary>
    public readonly struct BuildingInspectMessage
    {
        public readonly Unity.Entities.Entity Building;
        public BuildingInspectMessage(Unity.Entities.Entity building) => Building = building;
    }

    /// <summary>"Player clicked a unit hex (not the one already controlled)" — possession target.</summary>
    public readonly struct PossessUnitMessage
    {
        public readonly Unity.Entities.Entity Unit;
        public PossessUnitMessage(Unity.Entities.Entity unit) => Unit = unit;
    }

    /// <summary>"Player clicked an empty hex while a unit is controlled" — move order.</summary>
    public readonly struct ControlledUnitMoveMessage
    {
        public readonly int Q, R;
        public ControlledUnitMoveMessage(int q, int r) { Q = q; R = r; }
    }

    // -- Selection (drag-select → bulk orders) --

    /// <summary>"Drag completed" — world-space rect of the selection marquee. SelectionSystem re-tags every Player-faction unit inside with SelectedTag.</summary>
    public readonly struct SelectionDragMessage
    {
        public readonly Unity.Mathematics.float2 MinWorld;
        public readonly Unity.Mathematics.float2 MaxWorld;
        public SelectionDragMessage(Unity.Mathematics.float2 minWorld, Unity.Mathematics.float2 maxWorld)
        {
            MinWorld = minWorld;
            MaxWorld = maxWorld;
        }
    }

    /// <summary>"Player clicked a hex while selection is non-empty" — SelectionMoveSystem spreads every SelectedTag unit into a ring formation around (Q,R).</summary>
    public readonly struct SelectionMoveMessage
    {
        public readonly int Q, R;
        public SelectionMoveMessage(int q, int r) { Q = q; R = r; }
    }
}
