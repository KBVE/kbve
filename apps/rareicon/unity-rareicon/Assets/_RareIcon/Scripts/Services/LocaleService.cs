using System.Collections.Generic;
using UnityEngine;
using Cysharp.Text;

namespace RareIcon
{
    /// <summary>
    /// i18n service. Locale is chosen once on the title screen and stays for the session.
    /// Static strings resolve via Get(key). Dynamic HUD text uses ZString for zero-alloc formatting.
    /// </summary>
    public class LocaleService
    {
        Dictionary<string, string> _strings = new();

        public string CurrentLocale { get; private set; } = "en";

        public LocaleService()
        {
            LoadLocale("en");
        }

        /// <summary>
        /// Set locale once from the title screen. Loads the full string table.
        /// </summary>
        public void SetLocale(string locale)
        {
            if (CurrentLocale == locale) return;
            LoadLocale(locale);
            CurrentLocale = locale;
        }

        /// <summary>
        /// Resolve a static string by key. Returns the key itself if not found.
        /// </summary>
        public string Get(string key)
        {
            return _strings.TryGetValue(key, out var value) ? value : key;
        }

        /// <summary>
        /// Zero-alloc formatted string for HUD values like "HP 120/350".
        /// Uses ZString — no GC pressure per frame.
        /// </summary>
        public string Format(string key, int current, int max)
        {
            var label = Get(key);
            return ZString.Format("{0} {1}/{2}", label, current, max);
        }

        /// <summary>
        /// Zero-alloc formatted string for single values like "Lv. 42".
        /// </summary>
        public string Format(string key, int value)
        {
            var label = Get(key);
            return ZString.Format("{0} {1}", label, value);
        }

        void LoadLocale(string locale)
        {
            var asset = Resources.Load<TextAsset>($"Locales/{locale}");
            if (asset == null)
            {
                Debug.LogError($"[LocaleService] Locale file not found: Locales/{locale}");
                return;
            }

            _strings = ParseFlat(asset.text);
            Debug.Log($"[LocaleService] Loaded {_strings.Count} strings for '{locale}'");
        }

        static Dictionary<string, string> ParseFlat(string json)
        {
            var dict = new Dictionary<string, string>();
            var trimmed = json.Trim();
            if (trimmed.Length < 2) return dict;
            trimmed = trimmed.Substring(1, trimmed.Length - 2);

            var i = 0;
            while (i < trimmed.Length)
            {
                var keyStart = trimmed.IndexOf('"', i);
                if (keyStart < 0) break;
                var keyEnd = trimmed.IndexOf('"', keyStart + 1);
                var key = trimmed.Substring(keyStart + 1, keyEnd - keyStart - 1);

                var valStart = trimmed.IndexOf('"', keyEnd + 1);
                var valEnd = FindClosingQuote(trimmed, valStart + 1);
                var val = trimmed.Substring(valStart + 1, valEnd - valStart - 1);

                dict[key] = val;
                i = valEnd + 1;
            }
            return dict;
        }

        static int FindClosingQuote(string s, int start)
        {
            for (var i = start; i < s.Length; i++)
            {
                if (s[i] == '\\') { i++; continue; }
                if (s[i] == '"') return i;
            }
            return s.Length - 1;
        }
    }
}
