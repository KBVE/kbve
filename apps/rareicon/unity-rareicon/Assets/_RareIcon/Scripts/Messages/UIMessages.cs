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
        // First 4 inventory slots from the hovered unit. ItemId == 0 means
        // empty. Goblin inventories are typically 1-3 stack types so 4 is
        // generous; truncated by HexHoverSystem if the unit carries more.
        public readonly ushort UnitInvId0, UnitInvCount0;
        public readonly ushort UnitInvId1, UnitInvCount1;
        public readonly ushort UnitInvId2, UnitInvCount2;
        public readonly ushort UnitInvId3, UnitInvCount3;

        public HexHoverMessage(int q, int r, byte biomeId, bool isLand,
                               byte wood = 0, byte stone = 0, byte berries = 0,
                               byte mushrooms = 0, byte herbs = 0,
                               byte unitType = 0,
                               float unitHealth = 0, float unitMaxHealth = 0,
                               float unitEnergy = 0, float unitMaxEnergy = 0,
                               float unitMana   = 0, float unitMaxMana   = 0,
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
            UnitType = unitType;
            UnitHealth   = unitHealth;
            UnitMaxHealth= unitMaxHealth;
            UnitEnergy   = unitEnergy;
            UnitMaxEnergy= unitMaxEnergy;
            UnitMana     = unitMana;
            UnitMaxMana  = unitMaxMana;
            UnitInvId0 = invId0; UnitInvCount0 = invCount0;
            UnitInvId1 = invId1; UnitInvCount1 = invCount1;
            UnitInvId2 = invId2; UnitInvCount2 = invCount2;
            UnitInvId3 = invId3; UnitInvCount3 = invCount3;
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
