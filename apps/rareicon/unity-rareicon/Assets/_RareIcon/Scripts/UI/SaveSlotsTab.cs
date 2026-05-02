using System;
using Cysharp.Text;
using UnityEngine;
using UnityEngine.UIElements;

namespace RareIcon
{
    /// <summary>Settings tab — list every save slot with thumbnail + manifest preview, plus row actions to Save (overwrite), Load (Restore), or Delete. Reads only the manifest.json entry of each bundle for the list, so dozens of slots populate without touching the multi-MB SQLite blob inside. Manual save name lives in a TextField above the list; clicking Save writes a new bundle (or overwrites if the slot already exists).</summary>
    public sealed class SaveSlotsTab : ISettingsTab
    {
        const int    DefaultSlotsToShow = 12;
        const string ManualSlotPrefix   = "manual";

        readonly LocaleService   _locale;
        readonly WorldGenSession _session;

        TextField     _newSlotField;
        Button        _newSlotButton;
        Label         _statusLabel;
        VisualElement _listHost;

        public string Title => "Saves";

        public SaveSlotsTab(LocaleService locale, WorldGenSession session)
        {
            _locale  = locale;
            _session = session;
        }

        public VisualElement Build()
        {
            var root = new VisualElement();
            root.style.paddingTop = 4;
            root.style.paddingBottom = 4;

            var heading = UIStyles.MakeHeading(_locale.Get("settings.saves.heading"), fontSize: 14);
            heading.style.marginBottom = 6;
            root.Add(heading);

            var newRow = new VisualElement();
            newRow.style.flexDirection = FlexDirection.Row;
            newRow.style.alignItems = Align.Center;
            newRow.style.marginBottom = 6;

            _newSlotField = new TextField(_locale.Get("settings.saves.new_label")) { value = SuggestSlotName() };
            _newSlotField.style.flexGrow = 1f;
            _newSlotField.style.marginRight = 6;
            newRow.Add(_newSlotField);

            _newSlotButton = UIStyles.MakeButton(_locale.Get("settings.saves.new_button"), OnNewSaveClicked);
            _newSlotButton.style.height = 26;
            _newSlotButton.style.minWidth = 110;
            newRow.Add(_newSlotButton);

            root.Add(newRow);
            root.Add(UIStyles.MakeStrip(thickness: 1));

            _listHost = new VisualElement();
            _listHost.style.flexDirection = FlexDirection.Column;
            _listHost.style.marginTop = 6;
            root.Add(_listHost);

            _statusLabel = new Label(string.Empty);
            _statusLabel.style.color = UIStyles.Palette.TextStrong;
            _statusLabel.style.fontSize = 11;
            _statusLabel.style.marginTop = 8;
            _statusLabel.style.whiteSpace = WhiteSpace.Normal;
            root.Add(_statusLabel);

            return root;
        }

        public void OnActivated()
        {
            if (_statusLabel != null) _statusLabel.text = string.Empty;
            if (_newSlotField != null) _newSlotField.SetValueWithoutNotify(SuggestSlotName());
            RefreshList();
        }

        public void Dispose() { }

        void OnNewSaveClicked()
        {
            string slot = (_newSlotField?.value ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(slot)) slot = SuggestSlotName();
            DoSave(slot);
        }

        void DoSave(string slot)
        {
            byte[] thumb = ScreenshotService.CaptureThumbnailPng();
            var ctx = BuildContext();
            bool ok = SaveSlotService.Save(slot, ctx, thumb);
            SetStatus(_locale.Get(ok ? "settings.saves.save_ok" : "settings.saves.save_fail"), ok);
            RefreshList();
        }

        void DoRestore(string slot)
        {
            string live = WorldStoreSystem.LiveDbPath;
            bool ok = SaveSlotService.Restore(slot, live, out var reason);
            string text = ok
                ? _locale.Get("settings.saves.restore_ok")
                : ZString.Format(_locale.Get("settings.saves.restore_fail"), reason ?? "unknown");
            SetStatus(text, ok);
        }

        void DoDelete(string slot)
        {
            bool ok = SaveSlotService.Delete(slot);
            SetStatus(_locale.Get(ok ? "settings.saves.delete_ok" : "settings.saves.delete_fail"), ok);
            RefreshList();
        }

        void RefreshList()
        {
            if (_listHost == null) return;
            _listHost.Clear();

            var slots = SaveSlotService.ListSlotsWithMeta();
            if (slots == null || slots.Length == 0)
            {
                var empty = new Label(_locale.Get("settings.saves.empty"));
                empty.style.color = UIStyles.Palette.TextMuted;
                empty.style.fontSize = 11;
                _listHost.Add(empty);
                return;
            }

            int max = Math.Min(slots.Length, DefaultSlotsToShow);
            for (int i = 0; i < max; i++)
                _listHost.Add(BuildRow(slots[i]));
        }

        VisualElement BuildRow(SaveSlotService.SlotInfo info)
        {
            var row = new VisualElement().ApplyPanelChrome(padV: 6, padH: 8);
            row.style.flexDirection = FlexDirection.Row;
            row.style.alignItems = Align.Center;
            row.style.marginBottom = 4;

            var thumb = new VisualElement();
            thumb.style.width = 96;
            thumb.style.height = 54;
            thumb.style.marginRight = 8;
            thumb.style.backgroundColor = UIStyles.Palette.Zinc800;
            thumb.style.borderTopWidth = 1;
            thumb.style.borderBottomWidth = 1;
            thumb.style.borderLeftWidth = 1;
            thumb.style.borderRightWidth = 1;
            thumb.style.borderTopColor    = UIStyles.Palette.BorderGold;
            thumb.style.borderBottomColor = UIStyles.Palette.BorderGold;
            thumb.style.borderLeftColor   = UIStyles.Palette.BorderGold;
            thumb.style.borderRightColor  = UIStyles.Palette.BorderGold;
            byte[] thumbBytes = info.IsLegacy ? null : SaveBundleIO.ReadThumbnail(info.Path);
            if (thumbBytes != null && thumbBytes.Length > 0)
            {
                var tex = new Texture2D(2, 2, TextureFormat.RGB24, false);
                if (tex.LoadImage(thumbBytes))
                    thumb.style.backgroundImage = new StyleBackground(tex);
            }
            row.Add(thumb);

            var meta = new VisualElement();
            meta.style.flexGrow = 1f;
            meta.style.flexDirection = FlexDirection.Column;

            var title = new Label(info.Slot);
            title.style.color = UIStyles.Palette.TextStrong;
            title.style.fontSize = 13;
            title.style.unityFontStyleAndWeight = FontStyle.Bold;
            meta.Add(title);

            var subtitle = new Label(BuildSubtitle(info));
            subtitle.style.color = UIStyles.Palette.TextMuted;
            subtitle.style.fontSize = 10;
            subtitle.style.whiteSpace = WhiteSpace.Normal;
            meta.Add(subtitle);

            row.Add(meta);

            var actions = new VisualElement();
            actions.style.flexDirection = FlexDirection.Row;
            actions.style.alignItems = Align.Center;
            actions.style.marginLeft = 6;

            string slot = info.Slot;
            actions.Add(MakeRowButton(_locale.Get("settings.saves.row_save"), () => DoSave(slot)));
            actions.Add(MakeRowButton(_locale.Get("settings.saves.row_load"), () => DoRestore(slot)));
            actions.Add(MakeRowButton(_locale.Get("settings.saves.row_delete"), () => DoDelete(slot), UIStyles.Palette.Alert));

            row.Add(actions);
            return row;
        }

        Button MakeRowButton(string label, Action onClick, UnityEngine.Color? bgOverride = null)
        {
            var btn = UIStyles.MakeButton(label, onClick);
            btn.style.height = 26;
            btn.style.minWidth = 60;
            btn.style.marginLeft = 4;
            btn.style.fontSize = 11;
            btn.style.unityFontStyleAndWeight = FontStyle.Bold;
            if (bgOverride.HasValue)
            {
                btn.style.backgroundColor = bgOverride.Value;
                btn.style.color = UIStyles.Palette.GoldBright;
            }
            return btn;
        }

        static string BuildSubtitle(SaveSlotService.SlotInfo info)
        {
            using var sb = ZString.CreateStringBuilder();
            if (info.IsLegacy)
            {
                sb.Append("Legacy slot · ");
            }
            if (info.Manifest != null)
            {
                sb.Append("Turn ");
                sb.Append(info.Manifest.TurnIndex);
                sb.Append(" · seed ");
                sb.Append(info.Manifest.Seed);
                sb.Append(" · v");
                sb.Append(info.Manifest.GameVersion ?? "?");
                sb.Append(" · ");
            }
            sb.Append(FormatBytes(info.FileBytes));
            sb.Append(" · ");
            sb.Append(FormatTime(info.FileMtimeUnixMs));
            return sb.ToString();
        }

        static string FormatBytes(long bytes)
        {
            if (bytes < 1024) return bytes + " B";
            if (bytes < 1024 * 1024) return (bytes / 1024f).ToString("0.0") + " KB";
            return (bytes / (1024f * 1024f)).ToString("0.0") + " MB";
        }

        static string FormatTime(long unixMs)
        {
            try
            {
                var dt = DateTimeOffset.FromUnixTimeMilliseconds(unixMs).LocalDateTime;
                return dt.ToString("yyyy-MM-dd HH:mm");
            }
            catch { return "?"; }
        }

        SaveContext BuildContext()
        {
            int seed = _session != null ? _session.Seed.CurrentValue : 0;
            return new SaveContext(seed, capitalName: string.Empty, playtimeSeconds: Time.realtimeSinceStartupAsDouble);
        }

        static string SuggestSlotName()
        {
            return ManualSlotPrefix + "-" + DateTime.Now.ToString("yyyyMMdd-HHmm");
        }

        void SetStatus(string text, bool success)
        {
            if (_statusLabel == null) return;
            _statusLabel.text = text;
            _statusLabel.style.color = success ? UIStyles.Palette.Success : UIStyles.Palette.Alert;
        }
    }
}
