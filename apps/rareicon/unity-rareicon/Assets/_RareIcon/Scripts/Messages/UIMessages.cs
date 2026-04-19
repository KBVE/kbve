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
        // Each hex carries multiple resources at once. 0 means "not present".
        public readonly byte Wood, Stone, Berries, Mushrooms, Herbs;
        // UnitType.* of any creature standing on this hex (0 = none).
        public readonly byte UnitType;
        // Unit stats — Max=0 means the unit doesn't carry that stat (the
        // HUD hides the line entirely). Floats so partially-filled bars are
        // exact (no rounding when displayed).
        public readonly float UnitHealth, UnitMaxHealth;
        public readonly float UnitEnergy, UnitMaxEnergy;
        public readonly float UnitMana,   UnitMaxMana;

        public HexHoverMessage(int q, int r, byte biomeId, bool isLand,
                               byte wood = 0, byte stone = 0, byte berries = 0,
                               byte mushrooms = 0, byte herbs = 0,
                               byte unitType = 0,
                               float unitHealth = 0, float unitMaxHealth = 0,
                               float unitEnergy = 0, float unitMaxEnergy = 0,
                               float unitMana   = 0, float unitMaxMana   = 0)
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
            UnitType = unitType;
            UnitHealth   = unitHealth;
            UnitMaxHealth= unitMaxHealth;
            UnitEnergy   = unitEnergy;
            UnitMaxEnergy= unitMaxEnergy;
            UnitMana     = unitMana;
            UnitMaxMana  = unitMaxMana;
        }
    }

    // -- Hex interactions --

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

    // -- Panel visibility --

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
}
