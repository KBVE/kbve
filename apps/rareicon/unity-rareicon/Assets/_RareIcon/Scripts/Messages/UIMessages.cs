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

        public HexHoverMessage(int q, int r, byte biomeId, bool isLand,
                               byte wood = 0, byte stone = 0, byte berries = 0,
                               byte mushrooms = 0, byte herbs = 0,
                               byte unitType = 0)
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
