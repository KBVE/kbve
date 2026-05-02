using UnityEngine;
using UnityEngine.UIElements;

namespace RareIcon
{
    /// <summary>Settings-panel tab — Save Game (writes the autosave slot via <see cref="SaveSlotService"/>) and Exit Game (Application.Quit). Buttons are sized large + high-contrast so they read at a glance, since this is the primary clean-shutdown surface for the player.</summary>
    public sealed class SystemTab : ISettingsTab
    {
        readonly LocaleService     _locale;
        readonly WorldGenSession   _session;

        Label _statusLabel;

        public string Title => "System";

        public SystemTab(LocaleService locale, WorldGenSession session)
        {
            _locale  = locale;
            _session = session;
        }

        public VisualElement Build()
        {
            var root = new VisualElement();
            root.style.paddingTop = 4;
            root.style.paddingBottom = 4;

            var heading = UIStyles.MakeHeading(_locale.Get("settings.system.heading"), fontSize: 14);
            heading.style.marginBottom = 8;
            root.Add(heading);

            var save = MakePrimaryButton(_locale.Get("settings.system.save"), OnSaveClicked,
                bg: UIStyles.Palette.Gold, fg: UIStyles.Palette.Zinc950);
            save.style.marginBottom = 8;
            root.Add(save);

            var quit = MakePrimaryButton(_locale.Get("settings.system.exit"), OnExitClicked,
                bg: UIStyles.Palette.Alert, fg: UIStyles.Palette.GoldBright);
            root.Add(quit);

            _statusLabel = new Label(string.Empty);
            _statusLabel.style.color = UIStyles.Palette.TextStrong;
            _statusLabel.style.fontSize = 11;
            _statusLabel.style.marginTop = 12;
            _statusLabel.style.whiteSpace = WhiteSpace.Normal;
            root.Add(_statusLabel);

            return root;
        }

        public void OnActivated()
        {
            if (_statusLabel != null) _statusLabel.text = string.Empty;
        }

        void OnSaveClicked()
        {
            byte[] thumb = ScreenshotService.CaptureThumbnailPng();
            var ctx = BuildContext();
            bool ok = SaveSlotService.Save("autosave", ctx, thumb);
            _statusLabel.text = _locale.Get(ok ? "settings.system.save_ok" : "settings.system.save_fail");
            _statusLabel.style.color = ok ? UIStyles.Palette.Success : UIStyles.Palette.Alert;
        }

        void OnExitClicked()
        {
            // Persist before quitting so the autosave reflects the latest
            // tick. RustPersistenceFlushHook also fires on OnApplicationQuit
            // as a backstop, but driving it from here is more responsive.
            byte[] thumb = ScreenshotService.CaptureThumbnailPng();
            SaveSlotService.Save("autosave", BuildContext(), thumb);

#if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying = false;
#else
            Application.Quit();
#endif
        }

        SaveContext BuildContext()
        {
            int seed = _session != null ? _session.Seed.CurrentValue : 0;
            return new SaveContext(seed, capitalName: string.Empty, playtimeSeconds: Time.realtimeSinceStartupAsDouble);
        }

        static Button MakePrimaryButton(string text, System.Action onClick, Color bg, Color fg)
        {
            var btn = UIStyles.MakeButton(text, onClick);
            btn.style.height = 44;
            btn.style.fontSize = 16;
            btn.style.unityFontStyleAndWeight = FontStyle.Bold;
            btn.style.letterSpacing = 2;
            btn.style.backgroundColor = bg;
            btn.style.color = fg;
            btn.style.borderTopLeftRadius = 0;
            btn.style.borderTopRightRadius = 0;
            btn.style.borderBottomLeftRadius = 0;
            btn.style.borderBottomRightRadius = 0;
            return btn;
        }

        public void Dispose() { }
    }
}
