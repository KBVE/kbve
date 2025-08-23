using KBVE.MMExtensions.Orchestrator.Interfaces;
using KBVE.MMExtensions.Orchestrator.Core;
using KBVE.MMExtensions.Orchestrator.Core.UI;
using KBVE.MMExtensions.Orchestrator.Core.Quests;
using Cysharp.Threading.Tasks;
using VContainer;
using R3;
using System;
using System.Threading;
using UnityEngine;
using System.Runtime.CompilerServices;
using System.IO;

namespace KBVE.MMExtensions.Orchestrator
{
    /// <summary>
    /// Central access point for orchestrator services resolved via VContainer.
    /// </summary>
    public static class Operator
    {
        public static ICharacterRegistry Registry { get; internal set; }
        public static IPrefabOrchestrator Prefab { get; internal set; }
        public static TickSystem Ticker { get; internal set; }

        public static IToastService Toast { get; internal set; }

        private static readonly UniTaskCompletionSource _readyTcs = new();

        public static OrchestratorQuestService Quest { get; internal set; }

        public static UniTask Ready => _readyTcs.Task;
        
        public static ReactiveProperty<bool> DebugSettings { get; } = new(true);

        /// <summary>
        /// Initializes service references from VContainer.
        /// Should be called once during LifetimeScope.BuildCallback.
        /// </summary>
        public static void Init(IObjectResolver container)
        {
            Registry = container.Resolve<ICharacterRegistry>();
            Prefab = container.Resolve<IPrefabOrchestrator>();
            Ticker = container.Resolve<TickSystem>();
            Toast = container.Resolve<IToastService>();
            Quest = container.Resolve<OrchestratorQuestService>();

            _readyTcs.TrySetResult();

        }

        public static async UniTask WaitForFullReady()
        {
            await Ready;
            await Quest.QuestsReady.WaitUntilTrue();
        }
        public static UniTask R() => WaitForFullReady();

        public static void D(
            string message,
            [CallerMemberName] string memberName = "",
            [CallerFilePath] string filePath = "",
            [CallerLineNumber] int lineNumber = 0)
        {
            if (string.IsNullOrEmpty(message))
                return;
                
            if (!DebugSettings.Value)
                return;
                
            string fileName = Path.GetFileNameWithoutExtension(filePath);
            Debug.Log($"[{fileName}.{memberName}:{lineNumber}] {message}");
        }

    }
}
