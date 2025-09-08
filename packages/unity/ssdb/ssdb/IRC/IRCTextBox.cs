using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
using System;
using System.Collections.Generic;
using System.Threading;
using Cysharp.Threading.Tasks;
using R3;
using VContainer;
using VContainer.Unity;
using KBVE.MMExtensions.Orchestrator;
using KBVE.MMExtensions.Orchestrator.Interfaces;
using KBVE.MMExtensions.Orchestrator.Core;
using KBVE.MMExtensions.Orchestrator.Core.UI;
using TMPro;
using ObservableCollections;
using MoreMountains.TopDownEngine;
using MoreMountains.Tools;

namespace KBVE.SSDB.IRC
{
    public class IRCTextBox : IAsyncStartable, IDisposable
    {
        private IGlobalCanvas globalCanvas;
        private readonly IIRCService ircService;
        private readonly CompositeDisposable disposables = new();
        
        // UI Elements
        private GameObject panelRoot;
        private TMP_Text messagesText;
        private TMP_InputField inputField;
        private ScrollRect scrollRect;
        private Button sendButton;
        private Button minimizeButton;
        private GameObject contentPanel;
        
        // Input blocking state using R3
        private static readonly ReactiveProperty<bool> isMouseOverUI = new(false);
        private static readonly ReactiveProperty<bool> hasInputFocus = new(false);
        private static IRCTextBox activeInstance = null;
        
        // MoreMountains InputManager integration
        private static bool originalInputDetectionState = true;
        
        // Message history using ObservableRingBuffer for efficient rotating storage
        private readonly ObservableRingBuffer<string> messageHistory = new();
        private const int MaxMessages = 100;
        private readonly ReactiveProperty<bool> isMinimized = new(false);
        private IDisposable messageHistorySubscription;
        
        [Inject]
        public IRCTextBox(IIRCService ircService)
        {
            this.ircService = ircService ?? throw new ArgumentNullException(nameof(ircService));
        }
        
        /// <summary>
        /// Observable that emits when mouse enters/exits any IRC text box UI element
        /// </summary>
        public static Observable<bool> OnMouseOverTextBox => isMouseOverUI.AsObservable();
        
        /// <summary>
        /// Observable that emits when any IRC text box gains/loses input focus
        /// </summary>
        public static Observable<bool> OnInputFocusChanged => hasInputFocus.AsObservable();
        
        /// <summary>
        /// Check if the mouse is currently over any IRC text box UI element
        /// </summary>
        public static bool IsMouseOverTextBox() => isMouseOverUI.Value;
        
        /// <summary>
        /// Check if any IRC text box currently has input focus
        /// </summary>
        public static bool HasInputFocus() => hasInputFocus.Value;
        
        /// <summary>
        /// Check if any input should be blocked (for backwards compatibility)
        /// </summary>
        public static bool ShouldBlockInput() => hasInputFocus.Value || isMouseOverUI.Value;
        
        /// <summary>
        /// Manage MoreMountains InputManager state based on UI interaction
        /// </summary>
        private static void UpdateInputManagerState()
        {
            if (InputManager.Instance == null) return;
            
            bool shouldBlockInput = hasInputFocus.Value || isMouseOverUI.Value;
            
            if (shouldBlockInput && InputManager.Instance.InputDetectionActive)
            {
                // Store original state and disable input detection
                originalInputDetectionState = InputManager.Instance.InputDetectionActive;
                InputManager.Instance.InputDetectionActive = false;

                // Reset any stuck button states to prevent input bugs
                //InputManager.Instance.ForceAllButtonStatesTo(MMInput.ButtonStates.ButtonUp);
                Operator.D("IRCTextBox: Disabled MoreMountains input detection and reset button states");
            }
            else if (!shouldBlockInput && !InputManager.Instance.InputDetectionActive)
            {
                // Reset button states before re-enabling to ensure clean state
                //InputManager.Instance.ForceAllButtonStatesTo(MMInput.ButtonStates.ButtonUp);
                
                // Restore input detection
                InputManager.Instance.InputDetectionActive = originalInputDetectionState;
                
                Operator.D("IRCTextBox: Reset button states and restored MoreMountains input detection");
            }
        }
        
        public async UniTask StartAsync(CancellationToken cancellationToken)
        {
            // Wait for Operator to be ready
            await Operator.R();
            
            // Find the GlobalCanvas from scene (it's created by OrchestratorLifetimeScope)
            await UniTask.WaitUntil(() => 
            {
                var canvasService = GameObject.FindObjectOfType<GlobalCanvasService>();
                if (canvasService != null)
                {
                    globalCanvas = canvasService;
                    return globalCanvas.Canvas != null;
                }
                return false;
            }, cancellationToken: cancellationToken);
            
            Operator.D("IRCTextBox: Starting initialization");
            
            // Create the UI
            CreateUI();
            
            // Set up IRC message subscriptions
            SetupSubscriptions();
            
            // Set up input handling
            SetupInputHandling();
            
            Operator.D("IRCTextBox: Initialization complete");
        }
        
        private void CreateUI()
        {
            // Create main panel container
            panelRoot = new GameObject("IRCTextBox", typeof(RectTransform));
            panelRoot.transform.SetParent(globalCanvas.GetLayerRoot(UICanvasLayer.HUD), false);
            
            var rectTransform = panelRoot.GetComponent<RectTransform>();
            // Scale with screen size - 40% width, 50% height for better readability
            rectTransform.anchorMin = new Vector2(0, 0);
            rectTransform.anchorMax = new Vector2(0.4f, 0.5f);
            rectTransform.pivot = new Vector2(0, 0);
            rectTransform.offsetMin = new Vector2(10, 10);
            rectTransform.offsetMax = new Vector2(-10, -10);
            
            // Add background image
            var bgImage = panelRoot.AddComponent<Image>();
            bgImage.color = new Color(0.1f, 0.1f, 0.1f, 0.9f);
            
            // Add input blocking components
            SetupInputBlocking(panelRoot);
            
            // Create header bar
            var headerBar = CreateHeaderBar();
            
            // Create content panel (messages + input)
            contentPanel = new GameObject("ContentPanel", typeof(RectTransform));
            contentPanel.transform.SetParent(panelRoot.transform, false);
            
            var contentRect = contentPanel.GetComponent<RectTransform>();
            contentRect.anchorMin = new Vector2(0, 0);
            contentRect.anchorMax = new Vector2(1, 1);
            contentRect.offsetMin = new Vector2(5, 5);
            contentRect.offsetMax = new Vector2(-5, -35);
            
            // Create scroll view for messages
            CreateScrollView();
            
            // Create input area
            CreateInputArea();
            
            // Set up minimize toggle
            isMinimized.Subscribe(minimized =>
            {
                contentPanel.SetActive(!minimized);
                if (minimized)
                {
                    // Minimized: just header bar height
                    rectTransform.anchorMax = new Vector2(0.4f, 0.06f);
                }
                else
                {
                    // Expanded: 40% width, 50% height for better readability
                    rectTransform.anchorMax = new Vector2(0.4f, 0.5f);
                }
            }).AddTo(disposables);
        }
        
        private GameObject CreateHeaderBar()
        {
            var headerBar = new GameObject("HeaderBar", typeof(RectTransform));
            headerBar.transform.SetParent(panelRoot.transform, false);
            
            var headerRect = headerBar.GetComponent<RectTransform>();
            headerRect.anchorMin = new Vector2(0, 1);
            headerRect.anchorMax = new Vector2(1, 1);
            headerRect.pivot = new Vector2(0.5f, 1);
            headerRect.offsetMin = new Vector2(5, -35);
            headerRect.offsetMax = new Vector2(-5, -5);
            
            // Add background
            var headerBg = headerBar.AddComponent<Image>();
            headerBg.color = new Color(0.15f, 0.15f, 0.15f, 1f);
            
            // Add title text
            var titleObj = new GameObject("Title", typeof(RectTransform));
            titleObj.transform.SetParent(headerBar.transform, false);
            
            var titleRect = titleObj.GetComponent<RectTransform>();
            titleRect.anchorMin = new Vector2(0, 0);
            titleRect.anchorMax = new Vector2(1, 1);
            titleRect.offsetMin = new Vector2(10, 0);
            titleRect.offsetMax = new Vector2(-40, 0);
            
            var titleText = titleObj.AddComponent<TextMeshProUGUI>();
            titleText.text = "IRC Chat";
            titleText.fontSize = 14;
            titleText.alignment = TextAlignmentOptions.MidlineLeft;
            titleText.color = Color.white;
            
            // Add connection status indicator
            ircService.IsConnected.Subscribe(connected =>
            {
                var status = connected ? " [Connected]" : " [Disconnected]";
                var color = connected ? "#00FF00" : "#FF0000";
                titleText.text = $"IRC Chat <color={color}>{status}</color>";
            }).AddTo(disposables);
            
            // Add minimize button
            var minButtonObj = new GameObject("MinimizeButton", typeof(RectTransform));
            minButtonObj.transform.SetParent(headerBar.transform, false);
            
            var minButtonRect = minButtonObj.GetComponent<RectTransform>();
            minButtonRect.anchorMin = new Vector2(1, 0);
            minButtonRect.anchorMax = new Vector2(1, 1);
            minButtonRect.pivot = new Vector2(1, 0.5f);
            minButtonRect.sizeDelta = new Vector2(30, 30);
            minButtonRect.anchoredPosition = new Vector2(-5, 0);
            
            minimizeButton = minButtonObj.AddComponent<Button>();
            var minBtnImage = minButtonObj.AddComponent<Image>();
            minBtnImage.color = new Color(0.3f, 0.3f, 0.3f, 1f);
            
            var minBtnText = new GameObject("Text", typeof(RectTransform));
            minBtnText.transform.SetParent(minButtonObj.transform, false);
            
            var minTextRect = minBtnText.GetComponent<RectTransform>();
            minTextRect.anchorMin = Vector2.zero;
            minTextRect.anchorMax = Vector2.one;
            minTextRect.offsetMin = Vector2.zero;
            minTextRect.offsetMax = Vector2.zero;
            
            var minText = minBtnText.AddComponent<TextMeshProUGUI>();
            minText.text = "_";
            minText.fontSize = 18;
            minText.alignment = TextAlignmentOptions.Center;
            minText.color = Color.white;
            
            minimizeButton.onClick.AddListener(() => isMinimized.Value = !isMinimized.Value);
            
            return headerBar;
        }
        
        private void CreateScrollView()
        {
            // Create ScrollView container
            var scrollViewObj = new GameObject("ScrollView", typeof(RectTransform));
            scrollViewObj.transform.SetParent(contentPanel.transform, false);
            
            var scrollRect = scrollViewObj.AddComponent<ScrollRect>();
            this.scrollRect = scrollRect;
            
            var scrollRectTransform = scrollViewObj.GetComponent<RectTransform>();
            scrollRectTransform.anchorMin = new Vector2(0, 0);
            scrollRectTransform.anchorMax = new Vector2(1, 1);
            scrollRectTransform.offsetMin = new Vector2(0, 40);
            scrollRectTransform.offsetMax = new Vector2(0, 0);
            
            // Add mask
            var mask = scrollViewObj.AddComponent<Mask>();
            mask.showMaskGraphic = false;
            
            var scrollBg = scrollViewObj.AddComponent<Image>();
            scrollBg.color = new Color(0.05f, 0.05f, 0.05f, 1f);
            
            // Create viewport/content
            var viewport = new GameObject("Viewport", typeof(RectTransform));
            viewport.transform.SetParent(scrollViewObj.transform, false);
            
            var viewportRect = viewport.GetComponent<RectTransform>();
            viewportRect.anchorMin = Vector2.zero;
            viewportRect.anchorMax = Vector2.one;
            viewportRect.offsetMin = new Vector2(5, 5);
            viewportRect.offsetMax = new Vector2(-5, -5);
            
            var content = new GameObject("Content", typeof(RectTransform));
            content.transform.SetParent(viewport.transform, false);
            
            var contentRect = content.GetComponent<RectTransform>();
            contentRect.anchorMin = new Vector2(0, 0);
            contentRect.anchorMax = new Vector2(1, 1);
            contentRect.pivot = new Vector2(0, 1);
            contentRect.offsetMin = Vector2.zero;
            contentRect.offsetMax = Vector2.zero;
            
            // Add ContentSizeFitter to auto-resize based on text
            var sizeFitter = content.AddComponent<ContentSizeFitter>();
            sizeFitter.verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            
            // Add text component for messages
            messagesText = content.AddComponent<TextMeshProUGUI>();
            messagesText.fontSize = 12;
            messagesText.color = Color.white;
            messagesText.text = "IRC Chat initialized...\n";
            messagesText.alignment = TextAlignmentOptions.TopLeft;
            
            // Configure ScrollRect
            scrollRect.content = contentRect;
            scrollRect.viewport = viewportRect;
            scrollRect.horizontal = false;
            scrollRect.vertical = true;
            scrollRect.scrollSensitivity = 10;
        }
        
        private void CreateInputArea()
        {
            // Create input container
            var inputContainer = new GameObject("InputContainer", typeof(RectTransform));
            inputContainer.transform.SetParent(contentPanel.transform, false);
            
            var inputContainerRect = inputContainer.GetComponent<RectTransform>();
            inputContainerRect.anchorMin = new Vector2(0, 0);
            inputContainerRect.anchorMax = new Vector2(1, 0);
            inputContainerRect.pivot = new Vector2(0.5f, 0);
            inputContainerRect.sizeDelta = new Vector2(0, 35);
            inputContainerRect.anchoredPosition = new Vector2(0, 0);
            
            // Create input field
            var inputFieldObj = new GameObject("InputField", typeof(RectTransform));
            inputFieldObj.transform.SetParent(inputContainer.transform, false);
            
            var inputFieldRect = inputFieldObj.GetComponent<RectTransform>();
            inputFieldRect.anchorMin = new Vector2(0, 0);
            inputFieldRect.anchorMax = new Vector2(1, 1);
            inputFieldRect.offsetMin = new Vector2(0, 0);
            inputFieldRect.offsetMax = new Vector2(-70, 0);
            
            var inputBg = inputFieldObj.AddComponent<Image>();
            inputBg.color = new Color(0.2f, 0.2f, 0.2f, 1f);
            
            inputField = inputFieldObj.AddComponent<TMP_InputField>();
            
            // Create text area for input field
            var textArea = new GameObject("Text Area", typeof(RectTransform));
            textArea.transform.SetParent(inputFieldObj.transform, false);
            
            var textAreaRect = textArea.GetComponent<RectTransform>();
            textAreaRect.anchorMin = Vector2.zero;
            textAreaRect.anchorMax = Vector2.one;
            textAreaRect.offsetMin = new Vector2(5, 5);
            textAreaRect.offsetMax = new Vector2(-5, -5);
            
            // Add mask to text area
            textArea.AddComponent<RectMask2D>();
            
            // Create placeholder
            var placeholder = new GameObject("Placeholder", typeof(RectTransform));
            placeholder.transform.SetParent(textArea.transform, false);
            
            var placeholderRect = placeholder.GetComponent<RectTransform>();
            placeholderRect.anchorMin = Vector2.zero;
            placeholderRect.anchorMax = Vector2.one;
            placeholderRect.offsetMin = Vector2.zero;
            placeholderRect.offsetMax = Vector2.zero;
            
            var placeholderText = placeholder.AddComponent<TextMeshProUGUI>();
            placeholderText.text = "Type message...";
            placeholderText.fontSize = 12;
            placeholderText.color = new Color(0.5f, 0.5f, 0.5f, 0.5f);
            
            // Create actual text
            var text = new GameObject("Text", typeof(RectTransform));
            text.transform.SetParent(textArea.transform, false);
            
            var textRect = text.GetComponent<RectTransform>();
            textRect.anchorMin = Vector2.zero;
            textRect.anchorMax = Vector2.one;
            textRect.offsetMin = Vector2.zero;
            textRect.offsetMax = Vector2.zero;
            
            var textComponent = text.AddComponent<TextMeshProUGUI>();
            textComponent.fontSize = 12;
            textComponent.color = Color.white;
            
            // Configure input field
            inputField.textViewport = textAreaRect;
            inputField.textComponent = textComponent;
            inputField.placeholder = placeholderText;
            inputField.lineType = TMP_InputField.LineType.SingleLine;
            
            // Create send button
            var sendButtonObj = new GameObject("SendButton", typeof(RectTransform));
            sendButtonObj.transform.SetParent(inputContainer.transform, false);
            
            var sendButtonRect = sendButtonObj.GetComponent<RectTransform>();
            sendButtonRect.anchorMin = new Vector2(1, 0);
            sendButtonRect.anchorMax = new Vector2(1, 1);
            sendButtonRect.pivot = new Vector2(1, 0.5f);
            sendButtonRect.sizeDelta = new Vector2(65, 0);
            sendButtonRect.anchoredPosition = new Vector2(0, 0);
            
            sendButton = sendButtonObj.AddComponent<Button>();
            var sendBtnImage = sendButtonObj.AddComponent<Image>();
            sendBtnImage.color = new Color(0.3f, 0.5f, 0.3f, 1f);
            
            var sendBtnText = new GameObject("Text", typeof(RectTransform));
            sendBtnText.transform.SetParent(sendButtonObj.transform, false);
            
            var sendTextRect = sendBtnText.GetComponent<RectTransform>();
            sendTextRect.anchorMin = Vector2.zero;
            sendTextRect.anchorMax = Vector2.one;
            sendTextRect.offsetMin = Vector2.zero;
            sendTextRect.offsetMax = Vector2.zero;
            
            var sendText = sendBtnText.AddComponent<TextMeshProUGUI>();
            sendText.text = "Send";
            sendText.fontSize = 12;
            sendText.alignment = TextAlignmentOptions.Center;
            sendText.color = Color.white;
        }
        
        private void SetupSubscriptions()
        {
            // Subscribe to message history changes for auto-updating UI
            messageHistorySubscription = messageHistory
                .ObserveCountChanged()
                .Subscribe(_ => UpdateMessageDisplay())
                .AddTo(disposables);
            
            // Subscribe to incoming IRC messages
            ircService.OnMessageReceived
                .Where(msg => msg.isChannelMessage || msg.isPrivateMessage)
                .Subscribe(msg =>
                {
                    var formattedMessage = $"[{msg.timestamp:HH:mm:ss}] <{msg.nickname}> {msg.message}";
                    AddMessage(formattedMessage);
                })
                .AddTo(disposables);
            
            // Subscribe to connection state changes
            ircService.OnConnectionStateChanged
                .Subscribe(state =>
                {
                    AddMessage($"[System] Connection state: {state}");
                })
                .AddTo(disposables);
            
            // Subscribe to errors
            ircService.OnError
                .Subscribe(error =>
                {
                    AddMessage($"[Error] {error}");
                })
                .AddTo(disposables);
            
            // Subscribe to current channel changes
            ircService.CurrentChannel
                .Where(channel => !string.IsNullOrEmpty(channel))
                .Subscribe(channel =>
                {
                    AddMessage($"[System] Joined channel: {channel}");
                })
                .AddTo(disposables);
        }
        
        private void SetupInputHandling()
        {
            // Set this instance as active when input field is selected
            inputField.onSelect.AddListener(_ => 
            {
                activeInstance = this;
                hasInputFocus.Value = true;
                Operator.D("IRCTextBox: Input field focused");
            });
            
            inputField.onDeselect.AddListener(_ => 
            {
                if (activeInstance == this)
                {
                    activeInstance = null;
                    hasInputFocus.Value = false;
                }
                Operator.D("IRCTextBox: Input field unfocused");
            });
            
            // Handle send button click
            sendButton.onClick.AddListener(SendMessage);
            
            // Handle enter key in input field
            inputField.onSubmit.AddListener(_ => SendMessage());
            
            // Ensure input field shows cursor when focused
            inputField.caretBlinkRate = 0.85f; // Standard blink rate
            inputField.customCaretColor = true;
            inputField.caretColor = Color.white;
            
            // Subscribe to input focus changes and update InputManager
            OnInputFocusChanged
                .Subscribe(focused => 
                {
                    Operator.D($"IRCTextBox: Input focus changed to {focused}");
                    UpdateInputManagerState();
                })
                .AddTo(disposables);
        }
        
        private void SetupInputBlocking(GameObject rootPanel)
        {
            // Add EventTrigger for mouse enter/exit detection
            var eventTrigger = rootPanel.AddComponent<EventTrigger>();
            
            // Mouse enter - block input to other systems
            var pointerEnter = new EventTrigger.Entry { eventID = EventTriggerType.PointerEnter };
            pointerEnter.callback.AddListener((data) => 
            {
                isMouseOverUI.Value = true;
            });
            eventTrigger.triggers.Add(pointerEnter);
            
            // Mouse exit - allow input to other systems
            var pointerExit = new EventTrigger.Entry { eventID = EventTriggerType.PointerExit };
            pointerExit.callback.AddListener((data) => 
            {
                isMouseOverUI.Value = false;
            });
            eventTrigger.triggers.Add(pointerExit);
            
            // Click handler to focus input field when clicking on panel
            var pointerClick = new EventTrigger.Entry { eventID = EventTriggerType.PointerClick };
            pointerClick.callback.AddListener((data) => 
            {
                if (!isMinimized.Value && inputField != null)
                {
                    inputField.ActivateInputField();
                    inputField.Select();
                }
            });
            eventTrigger.triggers.Add(pointerClick);
            
            // Subscribe to mouse over changes and update InputManager
            OnMouseOverTextBox
                .Subscribe(mouseOver => 
                {
                    Operator.D($"IRCTextBox: Mouse over UI changed to {mouseOver}");
                    UpdateInputManagerState();
                })
                .AddTo(disposables);
        }
        
        private void SendMessage()
        {
            var message = inputField.text.Trim();
            if (string.IsNullOrEmpty(message))
                return;
            
            // Check if it's a command
            if (message.StartsWith("/"))
            {
                HandleCommand(message);
            }
            else
            {
                // Send to current channel
                var channel = ircService.CurrentChannelValue;
                if (!string.IsNullOrEmpty(channel))
                {
                    ircService.SendMessage(channel, message);
                    AddMessage($"[{DateTime.Now:HH:mm:ss}] <{ircService.CurrentNicknameValue}> {message}");
                }
                else
                {
                    AddMessage("[System] Not in a channel. Use /join #channel to join a channel.");
                }
            }
            
            // Clear input
            inputField.text = "";
            inputField.ActivateInputField();
        }
        
        private void HandleCommand(string command)
        {
            var parts = command.Split(' ', 2);
            var cmd = parts[0].ToLower();
            
            switch (cmd)
            {
                case "/join":
                    if (parts.Length > 1)
                    {
                        ircService.JoinChannel(parts[1]);
                    }
                    else
                    {
                        AddMessage("[System] Usage: /join #channel");
                    }
                    break;
                
                case "/part":
                case "/leave":
                    if (parts.Length > 1)
                    {
                        ircService.LeaveChannel(parts[1]);
                    }
                    else
                    {
                        var channel = ircService.CurrentChannelValue;
                        if (!string.IsNullOrEmpty(channel))
                        {
                            ircService.LeaveChannel(channel);
                        }
                    }
                    break;
                
                case "/connect":
                    ircService.ConnectAsync().Forget();
                    break;
                
                case "/disconnect":
                    ircService.Disconnect();
                    break;
                
                case "/raw":
                    if (parts.Length > 1)
                    {
                        ircService.SendRawCommand(parts[1]);
                        AddMessage($"[System] Sent raw: {parts[1]}");
                    }
                    break;
                
                case "/clear":
                    lock (messageHistory.SyncRoot)
                    {
                        messageHistory.Clear();
                    }
                    messagesText.text = "";
                    break;
                
                case "/help":
                    AddMessage("[System] Available commands:");
                    AddMessage("  /join #channel - Join a channel");
                    AddMessage("  /part [#channel] - Leave a channel");
                    AddMessage("  /connect - Connect to IRC server");
                    AddMessage("  /disconnect - Disconnect from server");
                    AddMessage("  /raw <command> - Send raw IRC command");
                    AddMessage("  /clear - Clear chat history");
                    AddMessage("  /help - Show this help");
                    break;
                
                default:
                    AddMessage($"[System] Unknown command: {cmd}");
                    break;
            }
        }
        
        private void AddMessage(string message)
        {
            // Thread-safe add to ring buffer with manual size limiting
            lock (messageHistory.SyncRoot)
            {
                messageHistory.AddLast(message);
                
                // Manually limit message history size
                while (messageHistory.Count > MaxMessages)
                {
                    messageHistory.RemoveFirst();
                }
            }
        }
        
        private void UpdateMessageDisplay()
        {
            // Update display with current messages
            lock (messageHistory.SyncRoot)
            {
                messagesText.text = string.Join("\n", messageHistory);
            }
            
            // Auto-scroll to bottom
            Canvas.ForceUpdateCanvases();
            scrollRect.verticalNormalizedPosition = 0f;
        }
        
        public void Dispose()
        {
            messageHistorySubscription?.Dispose();
            disposables?.Dispose();
            
            if (panelRoot != null)
            {
                GameObject.Destroy(panelRoot);
                panelRoot = null;
            }
        }
    }
}