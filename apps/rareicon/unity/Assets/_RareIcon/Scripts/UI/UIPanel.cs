using System.Collections.Generic;
using UnityEngine.UIElements;

namespace RareIcon
{
    /// <summary>
    /// A pooled UI panel. Created once at startup, toggled via display style.
    /// Text is resolved from LocaleService at creation — no per-frame overhead.
    /// </summary>
    public class UIPanel
    {
        public readonly string Key;
        public readonly VisualElement Root;
        readonly List<(TextElement element, string localeKey)> _bindings = new();

        public UIPanel(string key, VisualElement root)
        {
            Key = key;
            Root = root;
            Hide();
        }

        public void Show() => Root.style.display = DisplayStyle.Flex;
        public void Hide() => Root.style.display = DisplayStyle.None;
        public bool IsVisible => Root.style.display == DisplayStyle.Flex;

        /// <summary>
        /// Bind a text element to an i18n key. Call during panel setup.
        /// </summary>
        public void Bind(TextElement element, string localeKey)
        {
            _bindings.Add((element, localeKey));
        }

        /// <summary>
        /// Resolve all bound text from the locale service.
        /// Called once after locale is selected on the title screen.
        /// </summary>
        public void ResolveText(LocaleService locale)
        {
            foreach (var (element, localeKey) in _bindings)
                element.text = locale.Get(localeKey);
        }
    }
}
