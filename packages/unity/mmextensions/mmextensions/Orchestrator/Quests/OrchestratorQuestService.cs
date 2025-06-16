using System;
using System.Linq;
using System.Threading;
using Cysharp.Threading.Tasks;
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;
using ObservableCollections;
using R3;
using MoreMountains.Tools;
using KBVE.MMExtensions.Quests;
using VContainer;
using VContainer.Unity;

namespace KBVE.MMExtensions.Orchestrator.Core.Quests
{
    public class OrchestratorQuestService : IAsyncStartable, IDisposable
    {
        public ObservableList<MMQuest> LoadedQuests { get; } = new();
        public ReactiveProperty<bool> QuestsReady { get; } = new(false);
        private readonly CompositeDisposable _disposables = new();

        private CancellationTokenSource _cts;

        public async UniTask StartAsync(CancellationToken cancellationToken)
        {
            _cts = new CancellationTokenSource();
            var linkedToken = CancellationTokenSource.CreateLinkedTokenSource(_cts.Token, cancellationToken).Token;

            try
            {
                await LoadQuestAchievements(linkedToken);
            }
            catch (OperationCanceledException)
            {
                Debug.LogWarning("[OrchestratorQuestService] Initialization canceled.");
            }
        }

        private async UniTask LoadQuestAchievements(CancellationToken cancellationToken)
        {
            var handle = Addressables.LoadAssetAsync<MMAchievementList>("MMAchievementList");
            await handle.ToUniTask(cancellationToken: cancellationToken);

            if (handle.Status != AsyncOperationStatus.Succeeded)
            {
                Debug.LogError("[OrchestratorQuestService] Failed to load MMAchievementList from Addressables.");
                return;
            }

            var list = handle.Result;

            var questHandle = Addressables.LoadAssetAsync<QuestDB>("QuestDB"); // Me adding the QuestDB
            await questHandle.ToUniTask(cancellationToken: cancellationToken);

            if (questHandle.Status != AsyncOperationStatus.Succeeded)
            {
                Debug.LogError("[OrchestratorQuestService] Failed to load QuestDB from Addressables.");
                return;
            }

            var questDB = questHandle.Result;


            LoadedQuests.Clear();
            foreach (var mm in list.Achievements)
            {
                MMQuest _thisQuest = questDB.AllQuests.FirstOrDefault(a => a.AchievementID == mm.AchievementID);                
                LoadedQuests.Add(_thisQuest);
            }

            Debug.Log($"Quests in list of achievements: {list.Achievements.Count} Quests in LoadedQuests {LoadedQuests.Count} ");

            MMAchievementManager.LoadAchievementList(list);
            MMAchievementManager.LoadSavedAchievements();

            QuestsReady.Value = true;
        }

        public MMQuest GetQuestByAchievementId(string achievementId)
        {
            return LoadedQuests.FirstOrDefault(q => q.AchievementID == achievementId);
        }

        public MMQuest GetQuestBySlug(string slug)
        {
            return LoadedQuests.FirstOrDefault(q => q.Slug == slug);
        }

        public void Dispose()
        {
            _cts?.Cancel();
            _cts?.Dispose();
            _disposables.Dispose();
        }
    }
}
