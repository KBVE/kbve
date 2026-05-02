using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using MessagePipe;
using R3;
using UnityEngine;
using UnityEngine.UIElements;
using VContainer;
using VContainer.Unity;
#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS
using RareIcon.Platform;
#endif

namespace RareIcon
{
    /// <summary>Multi-stage title screen — locale picker → seed selection → background world-gen progress → Start. Mounts a UXML panel, drives stage transitions off <see cref="WorldGenSession.Stage"/>, and on Start hands control to <see cref="AppStateController.EnterWorld"/>. The panel auto-mounts as soon as <see cref="UIPanelManager"/> is ready and stays up while the app is in <see cref="AppInterfaceState.MainMenu"/>; once the player starts, the title is hidden for the rest of the session.</summary>
    public sealed class UITitleScreen : IAsyncStartable, IDisposable
    {
        readonly LocaleService _locale;
        readonly UIPanelManager _panelManager;
        readonly WorldGenSession _session;
        readonly AppStateController _appState;
        readonly UISettings _settings;
#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS
        readonly ISubscriber<SteamAvatarReadyMessage> _avatarSub;
        readonly ISteamAvatarService _avatars;
#endif

        readonly CompositeDisposable _disposables = new();

        VisualElement _root;
        VisualElement _wrapper;
        VisualElement _stageInfo;
        VisualElement _stageLocale;
        VisualElement _stageSeed;
        VisualElement _stageLoad;
        VisualElement _loadList;
        Label         _loadStatus;
        VisualElement _stageGenerating;
        VisualElement _avatar;
        Label _personaName;
        Label _personaStatus;
        IntegerField _seedInput;
        VisualElement _progressFill;
        Label _progressLabel;
        Button _startBtn;

        [Inject]
        public UITitleScreen(
            LocaleService locale,
            UIPanelManager panelManager,
            WorldGenSession session,
            AppStateController appState,
            UISettings settings
#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS
            , ISubscriber<SteamAvatarReadyMessage> avatarSub
            , ISteamAvatarService avatars
#endif
        )
        {
            _locale = locale;
            _panelManager = panelManager;
            _session = session;
            _appState = appState;
            _settings = settings;
#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS
            _avatarSub = avatarSub;
            _avatars = avatars;
#endif
        }

        public async UniTask StartAsync(CancellationToken cancellation)
        {
            var uiDoc = _panelManager.GetComponent<UIDocument>();
            if (uiDoc == null) return;

            int waited = 0;
            while (uiDoc.rootVisualElement == null && waited < 1000)
            {
                await UniTask.Delay(50, cancellationToken: cancellation);
                waited += 50;
            }
            if (uiDoc.rootVisualElement == null) return;

            _root = UIPanelLoader.Load(uiDoc, "UI/TitleScreen");
            if (_root == null) return;

            _root.pickingMode = PickingMode.Position;
            _root.BringToFront();

            var window = _root.Q<VisualElement>("title-window");
            if (window != null)
            {
                window.AddCornerNotches();
                window.AddToClassList("title-window--enter");
                window.schedule.Execute(() => window.RemoveFromClassList("title-window--enter"))
                              .StartingIn(32);

                int lastW = -1;
                System.Action sync = () =>
                {
                    int w = Screen.width;
                    if (w == lastW) return;
                    lastW = w;
                    bool tiny       = w > 0 && w < 480;
                    bool narrow     = w > 0 && w < 640;
                    bool wide       = w >= 1280;
                    bool ultrawide  = w >= 2560;
                    if (tiny)      window.AddToClassList("title-window--tiny");
                    else           window.RemoveFromClassList("title-window--tiny");
                    if (narrow)    window.AddToClassList("title-window--narrow");
                    else           window.RemoveFromClassList("title-window--narrow");
                    if (wide)      window.AddToClassList("title-window--wide");
                    else           window.RemoveFromClassList("title-window--wide");
                    if (ultrawide) window.AddToClassList("title-window--ultrawide");
                    else           window.RemoveFromClassList("title-window--ultrawide");
                };
                window.RegisterCallback<GeometryChangedEvent>(_ => sync());
                window.schedule.Execute(sync).Every(250);
                sync();
            }

            _wrapper         = _root.Q<VisualElement>("title-wrapper");
            _stageInfo       = _root.Q<VisualElement>("title-stage-info");
            _stageLocale     = _root.Q<VisualElement>("title-stage-locale");
            _stageSeed       = _root.Q<VisualElement>("title-stage-seed");
            _stageLoad       = _root.Q<VisualElement>("title-stage-load");
            _loadList        = _root.Q<VisualElement>("title-load-list");
            _loadStatus      = _root.Q<Label>("title-load-status");
            _stageGenerating = _root.Q<VisualElement>("title-stage-generating");
            _avatar          = _root.Q<VisualElement>("title-avatar");
            _personaName     = _root.Q<Label>("title-persona-name");
            _personaStatus   = _root.Q<Label>("title-persona-status");
            _seedInput       = _root.Q<IntegerField>("title-seed-input");
            _progressFill    = _root.Q<VisualElement>("title-progress-fill");
            _progressLabel   = _root.Q<Label>("title-progress");
            _startBtn        = _root.Q<Button>("title-start");

            BindMenu();
            BindLocaleStage();
            BindSeedStage();
            BindLoadStage();
            BindGeneratingStage();
            BindPersona();
            BindClose();
            BindSocials();

            _session.Stage.Subscribe(OnStageChanged).AddTo(_disposables);
            _session.ChunksReady.Subscribe(_ => RefreshProgress()).AddTo(_disposables);
            _session.Seed.Subscribe(s =>
            {
                if (_seedInput != null && _seedInput.value != s) _seedInput.SetValueWithoutNotify(s);
            }).AddTo(_disposables);

#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS
            var bag = MessagePipe.DisposableBag.CreateBuilder();
            _avatarSub.Subscribe(_ => RefreshAvatar()).AddTo(bag);
            _disposables.Add(bag.Build());
#endif
        }

        /// <summary>Wire the AoE-style left menu rail. Single Player drops into the existing locale → seed → generating flow; Codex / Credits open external KBVE pages; Exit triggers Application.Quit. Multiplayer / Mods / Settings stay disabled visually until backend support lands.</summary>
        void BindMenu()
        {
            var sp = _root.Q<Button>("title-menu-singleplayer");
            if (sp != null) sp.clicked += _session.BeginSinglePlayer;

            var quick = _root.Q<Button>("title-menu-quick-continue");
            if (quick != null)
            {
                quick.clicked += OnQuickContinueClicked;
                // Show only when at least one save bundle exists. Skips
                // the slot picker entirely on click — restores the
                // most-recent slot directly.
                if (_session.HasAnySlot) quick.RemoveFromClassList("is-hidden");
            }

            var load = _root.Q<Button>("title-menu-load");
            if (load != null) load.clicked += _session.BeginLoadFlow;

            var settings = _root.Q<Button>("title-menu-settings");
            if (settings != null) settings.clicked += () => _settings?.Toggle();

            var codex = _root.Q<Button>("title-menu-codex");
            if (codex != null) codex.clicked += () => Application.OpenURL("https://kbve.com/itemdb/");

            var credits = _root.Q<Button>("title-menu-credits");
            if (credits != null) credits.clicked += () => Application.OpenURL("https://kbve.com/about/");

            var exit = _root.Q<Button>("title-menu-exit");
            if (exit != null) exit.clicked += () =>
            {
#if UNITY_EDITOR
                UnityEditor.EditorApplication.isPlaying = false;
#else
                Application.Quit();
#endif
            };
        }

        void BindLocaleStage()
        {
            _root.Q<Button>("title-locale-en").clicked += () => _session.SelectLocale("en");
            _root.Q<Button>("title-locale-ja").clicked += () => _session.SelectLocale("ja");
            var localeBack = _root.Q<Button>("title-locale-back");
            if (localeBack != null) localeBack.clicked += _session.BackToMenu;
        }

        /// <summary>Wire the top-right × button to Application.Quit. In the editor we stop play mode so devs aren't dropped onto the desktop.</summary>
        void BindClose()
        {
            var closeBtn = _root.Q<Button>("title-close");
            if (closeBtn == null) return;
            closeBtn.clicked += () =>
            {
#if UNITY_EDITOR
                UnityEditor.EditorApplication.isPlaying = false;
#else
                Application.Quit();
#endif
            };
        }

        /// <summary>Wire the bottom-right Discord / GitHub / Twitch buttons. SVG icons live under Resources/UI/icons/; if the project's vectorgraphics importer hasn't promoted them to a VectorImage the USS background-image lookup fails silently — when that happens we leave the two-letter text fallback visible.</summary>
        void BindSocials()
        {
            WireSocial("title-social-discord", "UI/icons/discord", "https://kbve.com/discord/");
            WireSocial("title-social-github",  "UI/icons/github",  "https://github.com/kbve/kbve");
            WireSocial("title-social-twitch",  "UI/icons/twitch",  "https://twitch.tv/kbve");
        }

        void WireSocial(string buttonName, string iconResource, string url)
        {
            var btn = _root.Q<Button>(buttonName);
            if (btn == null) return;
            btn.clicked += () => Application.OpenURL(url);

            // Probe Resources for the icon — if it loads as anything (Texture / VectorImage / Sprite),
            // mark the button so the text fallback collapses. SVG support varies by project; Resources
            // returns null when the importer is missing and the fallback letters stay visible.
            var probe = Resources.Load(iconResource);
            if (probe != null) btn.AddToClassList("title-social-btn--has-icon");
        }

        void BindLoadStage()
        {
            var back = _root.Q<Button>("title-load-back");
            if (back != null) back.clicked += _session.BackFromLoad;
        }

        void OnQuickContinueClicked()
        {
            bool ok = _session.QuickContinue(out var reason);
            if (!ok)
            {
                // Surface the failure via the Load stage's status label
                // — reuse the same surface as the slot-picker path so
                // the player has one place to read save errors.
                _session.BeginLoadFlow();
                if (_loadStatus != null)
                    _loadStatus.text = _locale.Get("title.load_failed") + ": " + (reason ?? "unknown");
            }
        }

        void RefreshLoadList()
        {
            if (_loadList == null) return;
            _loadList.Clear();
            if (_loadStatus != null) _loadStatus.text = string.Empty;

            var slots = SaveSlotService.ListSlotsWithMeta();
            if (slots == null || slots.Length == 0)
            {
                var empty = new Label(_locale.Get("title.load_empty"));
                empty.AddToClassList("title-load-empty");
                _loadList.Add(empty);
                return;
            }

            for (int i = 0; i < slots.Length; i++)
                _loadList.Add(BuildLoadRow(slots[i]));
        }

        VisualElement BuildLoadRow(SaveSlotService.SlotInfo info)
        {
            var row = new VisualElement();
            row.AddToClassList("title-load-row");
            row.style.flexDirection = FlexDirection.Row;
            row.style.alignItems = Align.Center;
            row.style.marginBottom = 6;
            row.style.paddingTop = 6;
            row.style.paddingBottom = 6;
            row.style.paddingLeft = 8;
            row.style.paddingRight = 8;

            var thumb = new VisualElement();
            thumb.style.width = 96;
            thumb.style.height = 54;
            thumb.style.marginRight = 10;
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
            title.style.unityFontStyleAndWeight = FontStyle.Bold;
            meta.Add(title);
            var subtitle = new Label(BuildLoadSubtitle(info));
            subtitle.style.fontSize = 10;
            subtitle.style.whiteSpace = WhiteSpace.Normal;
            meta.Add(subtitle);
            row.Add(meta);

            string slot = info.Slot;
            var loadBtn = new Button(() => OnLoadSlot(slot));
            loadBtn.text = _locale.Get("title.load_button");
            loadBtn.AddToClassList("btn");
            loadBtn.AddToClassList("title-action-btn");
            loadBtn.AddToClassList("title-action-btn--primary");
            loadBtn.style.minWidth = 90;
            row.Add(loadBtn);

            return row;
        }

        static string BuildLoadSubtitle(SaveSlotService.SlotInfo info)
        {
            string prefix = info.IsLegacy ? "Legacy · " : string.Empty;
            if (info.Manifest == null)
                return prefix + System.DateTimeOffset.FromUnixTimeMilliseconds(info.FileMtimeUnixMs).LocalDateTime.ToString("yyyy-MM-dd HH:mm");
            return prefix
                 + "Turn " + info.Manifest.TurnIndex
                 + " · seed " + info.Manifest.Seed
                 + " · " + System.DateTimeOffset.FromUnixTimeMilliseconds(info.FileMtimeUnixMs).LocalDateTime.ToString("yyyy-MM-dd HH:mm");
        }

        void OnLoadSlot(string slot)
        {
            if (_loadStatus != null) _loadStatus.text = _locale.Get("title.load_busy");
            bool ok = _session.LoadSlot(slot, out var reason);
            if (!ok && _loadStatus != null)
                _loadStatus.text = _locale.Get("title.load_failed") + ": " + (reason ?? "unknown");
        }

        void BindSeedStage()
        {
            if (_seedInput != null) _seedInput.SetValueWithoutNotify(_session.Seed.CurrentValue);
            _seedInput?.RegisterValueChangedCallback(evt => _session.SetSeed(evt.newValue));

            _root.Q<Button>("title-seed-random").clicked += _session.Randomize;
            // Seed → Back routes to the AoE menu, not Locale — language
            // is now committed on the standalone first-boot Language stage
            // and never re-appears in the Single Player flow.
            _root.Q<Button>("title-seed-back").clicked   += _session.BackToMenu;
            _root.Q<Button>("title-seed-confirm").clicked += () => _session.BeginGeneration();
        }

        void BindGeneratingStage()
        {
            _startBtn.SetEnabled(false);
            _startBtn.clicked += OnStartClicked;
        }

        void BindPersona()
        {
#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS
            if (SteamManager.IsReady)
            {
                _personaName.text = SteamManager.LocalPersonaName;
                _personaStatus.text = "Steam";
                RefreshAvatar();
                return;
            }
#endif
            _personaName.text = "Wanderer";
            _personaStatus.text = "Offline";
        }

#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS
        void RefreshAvatar()
        {
            if (!SteamManager.IsReady || _avatars == null) return;
            var tex = _avatars.TryGet(SteamManager.LocalSteamId, SteamAvatarSize.Medium);
            if (tex == null) return;
            _avatar.style.backgroundImage = new StyleBackground(tex);
        }
#endif

        void OnStageChanged(TitleStage stage)
        {
            SetStage(_stageInfo,       stage == TitleStage.Info);
            SetStage(_stageLocale,     stage == TitleStage.Locale);
            SetStage(_stageSeed,       stage == TitleStage.Seed);
            SetStage(_stageLoad,       stage == TitleStage.Load);
            SetStage(_stageGenerating, stage == TitleStage.Generating || stage == TitleStage.Ready);

            // First-boot Language picker has no menu behind it, so the
            // Back button is hidden until the player commits a locale at
            // least once. Re-pick paths from a future Settings tab can
            // surface the same stage with the back button enabled.
            var localeBack = _root.Q<Button>("title-locale-back");
            if (localeBack != null)
                localeBack.style.display = (_locale != null && _locale.HasUserPickedLocale)
                    ? DisplayStyle.Flex
                    : DisplayStyle.None;

            // Hide the menu rail entirely while the first-boot Language
            // picker is up so the only thing the player can interact with
            // is the language choice. After commit, the menu reappears.
            var menuRail = _root.Q<VisualElement>("title-menu");
            if (menuRail != null)
            {
                bool firstBoot = _locale != null && !_locale.HasUserPickedLocale;
                menuRail.style.display = (firstBoot && stage == TitleStage.Locale)
                    ? DisplayStyle.None
                    : DisplayStyle.Flex;
            }

            if (stage == TitleStage.Load) RefreshLoadList();

            if (stage == TitleStage.Ready)
            {
                _startBtn.SetEnabled(true);
                _progressLabel.text = "World ready";
            }
            else if (stage == TitleStage.Generating)
            {
                _startBtn.SetEnabled(false);
                _progressLabel.text = "Routing rivers and streaming chunks...";
            }
        }

        void RefreshProgress()
        {
            if (_progressFill == null) return;
            float ratio = _session.RequiredChunks <= 0
                ? 1f
                : Mathf.Clamp01(_session.ChunksReady.CurrentValue / (float)_session.RequiredChunks);
            _progressFill.style.width = Length.Percent(ratio * 100f);
        }

        void OnStartClicked()
        {
            if (_session.Stage.CurrentValue != TitleStage.Ready) return;
            WorldGenSession.MarkWorldStarted();
            _appState.EnterWorld();

            if (_root != null)
            {
                _root.pickingMode = PickingMode.Ignore;
                var window = _root.Q<VisualElement>("title-window");
                if (window != null) window.AddToClassList("title-window--enter");
                _root.style.opacity = 0f;
                _root.schedule.Execute(() =>
                {
                    _wrapper?.AddToClassList("is-hidden");
                    _root.style.display = DisplayStyle.None;
                }).StartingIn(320);
            }
        }

        static void SetStage(VisualElement el, bool visible)
        {
            if (el == null) return;
            if (visible) el.RemoveFromClassList("is-hidden");
            else         el.AddToClassList("is-hidden");
        }

        public void Dispose() => _disposables.Dispose();
    }
}
