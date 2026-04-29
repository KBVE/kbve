using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using MessagePipe;
using R3;
using RareIcon.Platform;
using UnityEngine;
using UnityEngine.UIElements;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Multi-stage title screen — locale picker → seed selection → background world-gen progress → Start. Mounts a UXML panel, drives stage transitions off <see cref="WorldGenSession.Stage"/>, and on Start hands control to <see cref="AppStateController.EnterWorld"/>. The panel auto-mounts as soon as <see cref="UIPanelManager"/> is ready and stays up while the app is in <see cref="AppInterfaceState.MainMenu"/>; once the player starts, the title is hidden for the rest of the session.</summary>
    public sealed class UITitleScreen : IAsyncStartable, IDisposable
    {
        readonly LocaleService _locale;
        readonly UIPanelManager _panelManager;
        readonly WorldGenSession _session;
        readonly AppStateController _appState;
        readonly ISubscriber<SteamAvatarReadyMessage> _avatarSub;
        readonly ISteamAvatarService _avatars;

        readonly CompositeDisposable _disposables = new();

        VisualElement _root;
        VisualElement _wrapper;
        VisualElement _stageLocale;
        VisualElement _stageSeed;
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
            ISubscriber<SteamAvatarReadyMessage> avatarSub,
            ISteamAvatarService avatars)
        {
            _locale = locale;
            _panelManager = panelManager;
            _session = session;
            _appState = appState;
            _avatarSub = avatarSub;
            _avatars = avatars;
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

                window.RegisterCallback<GeometryChangedEvent>(evt =>
                {
                    bool narrow = evt.newRect.width > 0f && evt.newRect.width < 420f;
                    if (narrow) window.AddToClassList("title-window--narrow");
                    else        window.RemoveFromClassList("title-window--narrow");
                });
            }

            _wrapper         = _root.Q<VisualElement>("title-wrapper");
            _stageLocale     = _root.Q<VisualElement>("title-stage-locale");
            _stageSeed       = _root.Q<VisualElement>("title-stage-seed");
            _stageGenerating = _root.Q<VisualElement>("title-stage-generating");
            _avatar          = _root.Q<VisualElement>("title-avatar");
            _personaName     = _root.Q<Label>("title-persona-name");
            _personaStatus   = _root.Q<Label>("title-persona-status");
            _seedInput       = _root.Q<IntegerField>("title-seed-input");
            _progressFill    = _root.Q<VisualElement>("title-progress-fill");
            _progressLabel   = _root.Q<Label>("title-progress");
            _startBtn        = _root.Q<Button>("title-start");

            BindLocaleStage();
            BindSeedStage();
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

            var bag = MessagePipe.DisposableBag.CreateBuilder();
            _avatarSub.Subscribe(_ => RefreshAvatar()).AddTo(bag);
            _disposables.Add(bag.Build());
        }

        void BindLocaleStage()
        {
            _root.Q<Button>("title-locale-en").clicked += () => _session.SelectLocale("en");
            _root.Q<Button>("title-locale-ja").clicked += () => _session.SelectLocale("ja");
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

        void BindSeedStage()
        {
            if (_seedInput != null) _seedInput.SetValueWithoutNotify(_session.Seed.CurrentValue);
            _seedInput?.RegisterValueChangedCallback(evt => _session.SetSeed(evt.newValue));

            _root.Q<Button>("title-seed-random").clicked += _session.Randomize;
            _root.Q<Button>("title-seed-back").clicked   += _session.BackToLocale;
            _root.Q<Button>("title-seed-confirm").clicked += () => _session.BeginGeneration();
        }

        void BindGeneratingStage()
        {
            _startBtn.SetEnabled(false);
            _startBtn.clicked += OnStartClicked;
        }

        void BindPersona()
        {
            if (SteamManager.IsReady)
            {
                _personaName.text = SteamManager.LocalPersonaName;
                _personaStatus.text = "Steam";
                RefreshAvatar();
            }
            else
            {
                _personaName.text = "Wanderer";
                _personaStatus.text = "Offline";
            }
        }

        void RefreshAvatar()
        {
            if (!SteamManager.IsReady || _avatars == null) return;
            var tex = _avatars.TryGet(SteamManager.LocalSteamId, SteamAvatarSize.Medium);
            if (tex == null) return;
            _avatar.style.backgroundImage = new StyleBackground(tex);
        }

        void OnStageChanged(TitleStage stage)
        {
            SetStage(_stageLocale,     stage == TitleStage.Locale);
            SetStage(_stageSeed,       stage == TitleStage.Seed);
            SetStage(_stageGenerating, stage == TitleStage.Generating || stage == TitleStage.Ready);

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
