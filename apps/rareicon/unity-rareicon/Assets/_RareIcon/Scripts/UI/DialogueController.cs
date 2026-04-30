using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using MessagePipe;
using R3;
using Unity.Entities;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;
using VContainer;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Orchestrates an active dialogue tree: looks up <see cref="DialogueTree"/> on start, routes each node to VN or Bubble renderer by mode, manages pause for VN, publishes <see cref="DialogueEndedMessage"/> when exhausted. F10 fires a debug hello-world tree for now.</summary>
    public class DialogueController : IAsyncStartable, IDisposable
    {
        readonly ISubscriber<DialogueStartMessage>     _startSub;
        readonly ISubscriber<DialogueAdvanceMessage>   _advanceSub;
        readonly ISubscriber<DialogueChoiceMessage>    _choiceSub;
        readonly ISubscriber<DialogueCancelMessage>    _cancelSub;
        readonly IPublisher<DialogueEndedMessage>      _endedPub;
        readonly IPublisher<SpeechBubbleMessage>       _bubblePub;
        readonly IPublisher<DialogueStartMessage>      _startPub;
        readonly PauseService  _pause;
        readonly DialogueVN    _vn;
        readonly UIPanelManager _panelManager;

        readonly CompositeDisposable _disposables = new();

        DialogueTree _activeTree;
        DialogueNode _currentNode;
        Entity _activeSpeaker;
        bool _isActive;
        int  _lastChoiceIndex;

        [Inject]
        public DialogueController(
            ISubscriber<DialogueStartMessage>   startSub,
            ISubscriber<DialogueAdvanceMessage> advanceSub,
            ISubscriber<DialogueChoiceMessage>  choiceSub,
            ISubscriber<DialogueCancelMessage>  cancelSub,
            IPublisher<DialogueEndedMessage>    endedPub,
            IPublisher<SpeechBubbleMessage>     bubblePub,
            IPublisher<DialogueStartMessage>    startPub,
            PauseService   pause,
            DialogueVN     vn,
            UIPanelManager panelManager)
        {
            _startSub   = startSub;
            _advanceSub = advanceSub;
            _choiceSub  = choiceSub;
            _cancelSub  = cancelSub;
            _endedPub   = endedPub;
            _bubblePub  = bubblePub;
            _startPub   = startPub;
            _pause      = pause;
            _vn         = vn;
            _panelManager = panelManager;
        }

        public async UniTask StartAsync(CancellationToken cancellation)
        {
            var bag = MessagePipe.DisposableBag.CreateBuilder();
            _startSub.Subscribe(OnStart).AddTo(bag);
            _advanceSub.Subscribe(OnAdvance).AddTo(bag);
            _choiceSub.Subscribe(OnChoice).AddTo(bag);
            _cancelSub.Subscribe(_ => End()).AddTo(bag);
            _disposables.Add(bag.Build());

            // Debug hotkey — F10 fires the hello-world tree. Scheduled on
            // the UIDocument root so it keeps firing while the VN panel
            // is hidden.
            var uiDoc = _panelManager.GetComponent<UIDocument>();
            if (uiDoc == null) return;

            int waited = 0;
            while (uiDoc.rootVisualElement == null && waited < 1000)
            {
                await UniTask.Delay(50, cancellationToken: cancellation);
                waited += 50;
            }
            if (uiDoc.rootVisualElement == null) return;

            uiDoc.rootVisualElement.schedule.Execute(TickDebugInput).Every(16);
        }

        void TickDebugInput()
        {
            var keyboard = Keyboard.current;
            if (keyboard == null) return;
            if (!keyboard.f10Key.wasPressedThisFrame) return;
            if (_isActive) return;
            _startPub.Publish(new DialogueStartMessage(DialogueTreeId.HelloWorld));
        }

        void OnStart(DialogueStartMessage msg)
        {
            if (_isActive) return;
            var tree = DialogueDB.Get(msg.TreeId);
            if (tree == null)
            {
                Debug.LogWarning($"[DialogueController] Unknown tree {msg.TreeId}");
                return;
            }

            _activeTree      = tree;
            _activeSpeaker   = msg.Speaker;
            _isActive        = true;
            _lastChoiceIndex = -1;

            VisitNode(tree.EntryNodeId);
        }

        void OnAdvance(DialogueAdvanceMessage _)
        {
            if (!_isActive || _currentNode == null) return;
            // Choices block auto-advance — must pick one.
            if (_currentNode.Choices != null && _currentNode.Choices.Length > 0) return;
            VisitNode(_currentNode.NextNodeId);
        }

        void OnChoice(DialogueChoiceMessage msg)
        {
            if (!_isActive || _currentNode?.Choices == null) return;
            if (msg.Index < 0 || msg.Index >= _currentNode.Choices.Length) return;
            _lastChoiceIndex = msg.Index;
            VisitNode(_currentNode.Choices[msg.Index].NextNodeId);
        }

        void VisitNode(ushort nodeId)
        {
            if (nodeId == 0 || _activeTree == null)
            {
                End();
                return;
            }

            var node = _activeTree.Find(nodeId);
            if (node == null)
            {
                Debug.LogWarning($"[DialogueController] Missing node {nodeId} in tree {_activeTree.Id}");
                End();
                return;
            }

            _currentNode = node;

            if (node.Mode == DialogueMode.VN)
            {
                EnsurePaused();
                _vn.Show(node, _activeSpeaker);
            }
            else
            {
                // Bubble node — fire-and-forget, auto-advance. If the tree
                // has no active speaker, skip bubble emission but still
                // advance so mixed-mode trees don't stall.
                if (_activeSpeaker != Entity.Null && node.Emoji != BubbleEmoji.None)
                {
                    _bubblePub.Publish(new SpeechBubbleMessage(
                        _activeSpeaker, node.Emoji, node.BubbleDuration));
                }
                VisitNode(node.NextNodeId);
            }
        }

        void EnsurePaused()
        {
            if (!_pause.IsPaused || _pause.TopReason != PauseReason.Dialogue)
                _pause.Pause(PauseReason.Dialogue);
        }

        void End()
        {
            if (!_isActive) return;
            var treeId = _activeTree?.Id ?? 0;
            _isActive      = false;
            _currentNode   = null;
            _activeTree    = null;
            _activeSpeaker = Entity.Null;

            _vn.Hide();
            _pause.Resume(PauseReason.Dialogue);

            if (treeId != 0) _endedPub.Publish(new DialogueEndedMessage(treeId, _lastChoiceIndex));
        }

        public void Dispose() => _disposables?.Dispose();
    }
}
