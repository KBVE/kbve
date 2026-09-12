using UnityEngine.UIElements;
using Cysharp.Text;

namespace RareIcon
{
    /// <summary>
    /// Static helpers for setting localized text on VisualElements.
    /// Uses ZString for zero-alloc formatting on dynamic values.
    /// </summary>
    public static class LocalizedText
    {
        /// <summary>
        /// Set a label's text from an i18n key. One-shot, no subscription.
        /// </summary>
        public static void Set(TextElement element, LocaleService locale, string key)
        {
            element.text = locale.Get(key);
        }

        /// <summary>
        /// Set a label with a formatted value like "HP 120/350". Zero-alloc via ZString.
        /// </summary>
        public static void SetFormatted(TextElement element, LocaleService locale, string key, int current, int max)
        {
            element.text = locale.Format(key, current, max);
        }

        /// <summary>
        /// Set a label with a single value like "Lv. 42". Zero-alloc via ZString.
        /// </summary>
        public static void SetFormatted(TextElement element, LocaleService locale, string key, int value)
        {
            element.text = locale.Format(key, value);
        }
    }
}
