namespace RareIcon
{
    // -- Locale --

    public readonly struct LocaleChangedMessage
    {
        public readonly string Locale;
        public LocaleChangedMessage(string locale) => Locale = locale;
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
