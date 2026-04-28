using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using MessagePipe;
using Unity.Entities;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Full-screen visual-novel renderer: backdrop, portrait placeholder, speaker nameplate, typewriter body, up to 6 choices. Input: Space/Enter advances or fast-forwards typewriter, 1-6 pick choices, mouse clicks backdrop or choice buttons. Escape cancels the whole tree.</summary>
    public class DialogueVN : IAsyncStartable, IDisposable
    {
        const int   MaxChoices          = 6;
        const int   TypewriterCharsPerS = 45;
        const float PortraitSize        = 128f;
        const float PanelMaxWidth       = 780f;

        readonly LocaleService _locale;
        readonly UIPanelManager _panelManager;
        readonly IPublisher<DialogueAdvanceMessage> _advancePub;
        readonly IPublisher<DialogueChoiceMessage>  _choicePub;
        readonly IPublisher<DialogueCancelMessage>  _cancelPub;

        VisualElement _backdrop;
        VisualElement _panel;
        VisualElement _portraitBox;
        Label _speakerLabel;
        Label _textLabel;
        Button _advanceBtn;
        Button _closeBtn;
        VisualElement _choiceRow;
        Button[] _choiceButtons;

        string _fullText;
        int _revealedChars;
        IVisualElementScheduledItem _typewriterHandle;
        bool _typewriterDone;

        int _activeChoiceCount;
        bool _visible;

        [Inject]
        public DialogueVN(
            LocaleService locale,
            UIPanelManager panelManager,
            IPublisher<DialogueAdvanceMessage> advancePub,
            IPublisher<DialogueChoiceMessage>  choicePub,
            IPublisher<DialogueCancelMessage>  cancelPub)
        {
            _locale       = locale;
            _panelManager = panelManager;
            _advancePub   = advancePub;
            _choicePub    = choicePub;
            _cancelPub    = cancelPub;
        }

        public async UniTask StartAsync(CancellationToken cancellation)
        {
            var uiDoc = _panelManager.GetComponent<UIDocument>();
            if (uiDoc == null)
            {
                Debug.LogError("[DialogueVN] UIPanelManager has no UIDocument");
                return;
            }

            int waited = 0;
            while (uiDoc.rootVisualElement == null && waited < 1000)
            {
                await UniTask.Delay(50, cancellationToken: cancellation);
                waited += 50;
            }
            if (uiDoc.rootVisualElement == null)
            {
                Debug.LogError("[DialogueVN] rootVisualElement still null");
                return;
            }

            BuildUI(uiDoc.rootVisualElement);
        }

        void BuildUI(VisualElement root)
        {
            _backdrop = new VisualElement();
            _backdrop.style.position = Position.Absolute;
            _backdrop.style.top = 0;
            _backdrop.style.left = 0;
            _backdrop.style.right = 0;
            _backdrop.style.bottom = 0;
            _backdrop.style.backgroundColor = UIStyles.Palette.BackdropDim;
            _backdrop.style.alignItems = Align.Center;
            _backdrop.style.justifyContent = Justify.FlexEnd;
            _backdrop.style.paddingBottom = 40;
            _backdrop.style.display = DisplayStyle.None;
            _backdrop.focusable = true;
            _backdrop.RegisterCallback<ClickEvent>(OnBackdropClick);
            _backdrop.RegisterCallback<KeyDownEvent>(OnKeyDown, TrickleDown.TrickleDown);

            _panel = new VisualElement().ApplyPanelChrome(
                background:  UIStyles.Palette.ModalBg,
                borderWidth: 2f,
                padV:        16,
                padH:        20);
            _panel.style.flexDirection = FlexDirection.Column;
            _panel.style.width = new Length(90, LengthUnit.Percent);
            _panel.style.maxWidth = PanelMaxWidth;
            _panel.style.minHeight = 180;
            _panel.RegisterCallback<ClickEvent>(e => e.StopPropagation());

            _closeBtn = UIStyles.MakeButton("×", () => _cancelPub.Publish(new DialogueCancelMessage()));
            _closeBtn.style.position = Position.Absolute;
            _closeBtn.style.top = 6;
            _closeBtn.style.right = 6;
            _closeBtn.style.width = 28;
            _closeBtn.style.height = 28;
            _closeBtn.style.paddingLeft = 0;
            _closeBtn.style.paddingRight = 0;
            _closeBtn.style.paddingTop = 0;
            _closeBtn.style.paddingBottom = 0;
            _closeBtn.style.fontSize = 18;
            _closeBtn.style.unityTextAlign = TextAnchor.MiddleCenter;
            _panel.Add(_closeBtn);

            var topRow = new VisualElement();
            topRow.style.flexDirection = FlexDirection.Row;
            topRow.style.alignItems = Align.FlexStart;

            _portraitBox = new VisualElement();
            _portraitBox.style.width = PortraitSize;
            _portraitBox.style.height = PortraitSize;
            _portraitBox.style.marginRight = 16;
            _portraitBox.style.backgroundColor = UIStyles.Palette.Zinc800;
            _portraitBox.style.BorderColor(UIStyles.Palette.BorderGold);
            _portraitBox.style.BorderWidth(2f);

            var textCol = new VisualElement();
            textCol.style.flexGrow = 1;
            textCol.style.flexDirection = FlexDirection.Column;

            _speakerLabel = UIStyles.MakeHeading("", fontSize: 18);
            _speakerLabel.style.marginBottom = 6;

            var strip = UIStyles.MakeStrip(thickness: 1f);
            strip.style.width = new Length(40, LengthUnit.Percent);
            strip.style.marginBottom = 10;

            _textLabel = new Label();
            _textLabel.style.color = UIStyles.Palette.TextStrong;
            _textLabel.style.fontSize = 14;
            _textLabel.style.whiteSpace = WhiteSpace.Normal;
            _textLabel.style.minHeight = 72;

            textCol.Add(_speakerLabel);
            textCol.Add(strip);
            textCol.Add(_textLabel);

            topRow.Add(_portraitBox);
            topRow.Add(textCol);

            _choiceRow = new VisualElement();
            _choiceRow.style.flexDirection = FlexDirection.Column;
            _choiceRow.style.marginTop = 12;
            _choiceButtons = new Button[MaxChoices];
            for (int i = 0; i < MaxChoices; i++)
            {
                int idx = i;
                var btn = UIStyles.MakeButton("", () => OnChoiceClicked(idx));
                btn.style.marginBottom = 4;
                btn.style.display = DisplayStyle.None;
                _choiceButtons[i] = btn;
                _choiceRow.Add(btn);
            }

            _advanceBtn = UIStyles.MakeButton("", OnAdvanceClicked);
            _advanceBtn.style.alignSelf = Align.FlexEnd;
            _advanceBtn.style.marginTop = 8;
            _advanceBtn.style.display = DisplayStyle.None;

            _panel.Add(topRow);
            _panel.Add(_choiceRow);
            _panel.Add(_advanceBtn);
            _backdrop.Add(_panel);
            root.Add(_backdrop);

            root.schedule.Execute(TickInput).Every(16);
        }

        public void Show(DialogueNode node, Entity speaker)
        {
            if (_backdrop == null) return;

            _speakerLabel.text = ResolveSpeakerName(node, speaker);
            _portraitBox.style.backgroundColor = TintFor(speaker, node);

            _fullText = _locale.Get(node.TextKey);
            _revealedChars = 0;
            _typewriterDone = false;
            _textLabel.text = string.Empty;
            _typewriterHandle?.Pause();
            float intervalMs = 1000f / TypewriterCharsPerS;
            _typewriterHandle = _textLabel.schedule.Execute(Typewriter).Every((long)intervalMs);

            _activeChoiceCount = 0;
            if (node.Choices != null && node.Choices.Length > 0)
            {
                _activeChoiceCount = Mathf.Min(node.Choices.Length, MaxChoices);
                for (int i = 0; i < MaxChoices; i++)
                {
                    if (i < _activeChoiceCount)
                    {
                        _choiceButtons[i].text = FormatChoice(i + 1, node.Choices[i].TextKey);
                        _choiceButtons[i].style.display = DisplayStyle.Flex;
                    }
                    else
                    {
                        _choiceButtons[i].style.display = DisplayStyle.None;
                    }
                }
                _advanceBtn.style.display = DisplayStyle.None;
            }
            else
            {
                for (int i = 0; i < MaxChoices; i++)
                    _choiceButtons[i].style.display = DisplayStyle.None;
                _advanceBtn.text = _locale.Get("dialogue.next") + " [Space]";
                _advanceBtn.style.display = DisplayStyle.Flex;
            }

            _backdrop.style.display = DisplayStyle.Flex;
            _visible = true;
            _backdrop.schedule.Execute(() => _backdrop.Focus()).StartingIn(16);
        }

        public void Hide()
        {
            if (_backdrop == null) return;
            _backdrop.style.display = DisplayStyle.None;
            _visible = false;
            _typewriterHandle?.Pause();
            _typewriterHandle = null;
        }

        void Typewriter()
        {
            if (_fullText == null) { _typewriterHandle?.Pause(); return; }
            _revealedChars++;
            if (_revealedChars >= _fullText.Length)
            {
                _textLabel.text = _fullText;
                _typewriterDone = true;
                _typewriterHandle?.Pause();
                return;
            }
            _textLabel.text = _fullText.Substring(0, _revealedChars);
        }

        void FastForward()
        {
            if (_fullText == null) return;
            _textLabel.text = _fullText;
            _revealedChars = _fullText.Length;
            _typewriterDone = true;
            _typewriterHandle?.Pause();
        }

        void TickInput()
        {
            if (!_visible) return;

            var keyboard = Keyboard.current;
            if (keyboard == null) return;

            if (keyboard.spaceKey.wasPressedThisFrame || keyboard.enterKey.wasPressedThisFrame)
            {
                if (!_typewriterDone) { FastForward(); return; }
                if (_activeChoiceCount == 0)
                    _advancePub.Publish(new DialogueAdvanceMessage());
                return;
            }

            if (_activeChoiceCount > 0)
            {
                for (int i = 0; i < _activeChoiceCount; i++)
                {
                    if (DigitKeyPressed(keyboard, i + 1))
                    {
                        _choicePub.Publish(new DialogueChoiceMessage(i));
                        return;
                    }
                }
            }
        }

        static bool DigitKeyPressed(Keyboard kb, int digit)
        {
            switch (digit)
            {
                case 1: return kb.digit1Key.wasPressedThisFrame;
                case 2: return kb.digit2Key.wasPressedThisFrame;
                case 3: return kb.digit3Key.wasPressedThisFrame;
                case 4: return kb.digit4Key.wasPressedThisFrame;
                case 5: return kb.digit5Key.wasPressedThisFrame;
                case 6: return kb.digit6Key.wasPressedThisFrame;
                case 7: return kb.digit7Key.wasPressedThisFrame;
                case 8: return kb.digit8Key.wasPressedThisFrame;
                case 9: return kb.digit9Key.wasPressedThisFrame;
                default: return false;
            }
        }

        void OnKeyDown(KeyDownEvent evt)
        {
            if (!_visible) return;

            if (evt.keyCode == KeyCode.Space || evt.keyCode == KeyCode.Return || evt.keyCode == KeyCode.KeypadEnter)
            {
                if (!_typewriterDone) { FastForward(); evt.StopPropagation(); return; }
                if (_activeChoiceCount == 0)
                {
                    _advancePub.Publish(new DialogueAdvanceMessage());
                    evt.StopPropagation();
                }
                return;
            }

            if (evt.keyCode == KeyCode.Escape)
            {
                _cancelPub.Publish(new DialogueCancelMessage());
                evt.StopPropagation();
                return;
            }

            if (_activeChoiceCount > 0)
            {
                int digit = evt.keyCode switch
                {
                    KeyCode.Alpha1 => 1, KeyCode.Alpha2 => 2, KeyCode.Alpha3 => 3,
                    KeyCode.Alpha4 => 4, KeyCode.Alpha5 => 5, KeyCode.Alpha6 => 6,
                    KeyCode.Keypad1 => 1, KeyCode.Keypad2 => 2, KeyCode.Keypad3 => 3,
                    KeyCode.Keypad4 => 4, KeyCode.Keypad5 => 5, KeyCode.Keypad6 => 6,
                    _ => 0,
                };
                if (digit > 0 && digit <= _activeChoiceCount)
                {
                    _choicePub.Publish(new DialogueChoiceMessage(digit - 1));
                    evt.StopPropagation();
                }
            }
        }

        void OnBackdropClick(ClickEvent _)
        {
            if (!_visible) return;
            if (!_typewriterDone) { FastForward(); return; }
            if (_activeChoiceCount == 0) _advancePub.Publish(new DialogueAdvanceMessage());
        }

        void OnAdvanceClicked()
        {
            if (!_visible) return;
            if (!_typewriterDone) { FastForward(); return; }
            if (_activeChoiceCount == 0) _advancePub.Publish(new DialogueAdvanceMessage());
        }

        void OnChoiceClicked(int idx)
        {
            if (!_visible || idx >= _activeChoiceCount) return;
            _choicePub.Publish(new DialogueChoiceMessage(idx));
        }

        string ResolveSpeakerName(DialogueNode node, Entity speaker)
        {
            if (speaker != Entity.Null)
            {
                var world = RareIcon.GameplayWorld.Resolve();
                if (world != null && world.IsCreated && world.EntityManager.Exists(speaker))
                {
                    var em = world.EntityManager;
                    if (em.HasComponent<UnitName>(speaker))
                    {
                        var n = em.GetComponentData<UnitName>(speaker);
                        var resolved = _locale.GetGoblinName(n.FirstNameId, n.EpithetId);
                        if (!string.IsNullOrEmpty(resolved)) return resolved;
                    }
                    if (em.HasComponent<Unit>(speaker))
                        return _locale.GetCreatureName(em.GetComponentData<Unit>(speaker).Type);
                }
            }
            return string.IsNullOrEmpty(node.SpeakerNameKey) ? string.Empty : _locale.Get(node.SpeakerNameKey);
        }

        Color TintFor(Entity speaker, DialogueNode node)
        {
            if (speaker == Entity.Null) return UIStyles.Palette.Zinc800;
            var world = RareIcon.GameplayWorld.Resolve();
            if (world == null || !world.IsCreated || !world.EntityManager.Exists(speaker))
                return UIStyles.Palette.Zinc800;
            var em = world.EntityManager;
            if (!em.HasComponent<Faction>(speaker)) return UIStyles.Palette.Zinc800;
            return em.GetComponentData<Faction>(speaker).Value switch
            {
                FactionType.Player   => UIStyles.Palette.GoldDeep,
                FactionType.Hostile  => UIStyles.Palette.Alert,
                FactionType.Beast    => UIStyles.Palette.Gold,
                FactionType.Wildlife => UIStyles.Palette.Success,
                _ => UIStyles.Palette.Zinc800,
            };
        }

        string FormatChoice(int oneIndexed, string textKey)
        {
            return string.Concat(oneIndexed.ToString(), ". ", _locale.Get(textKey));
        }

        public void Dispose() { }
    }
}
