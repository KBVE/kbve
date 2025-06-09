using System;
using System.Threading;
using Cysharp.Threading.Tasks;
using UnityEngine;
using VContainer;
using VContainer.Unity;
using R3;
using ObservableCollections;
using Heathen.SteamworksIntegration;
using Heathen.SteamworksIntegration.API;
using PlayerLoopTiming = Cysharp.Threading.Tasks.PlayerLoopTiming;
using SteamAchievements = Heathen.SteamworksIntegration.API.StatsAndAchievements.Client;
using FriendsAPI = Heathen.SteamworksIntegration.API.Friends.Client;
using Steamworks;

namespace KBVE.MMExtensions.SSDB.Steam
{
    //need to call this method from somewhere: inside the place it's unlocked in moremountains
    //or add listener to moremountains unlock w/ observer

    public class SteamAchievements : IAsyncStartable, IDisposable {


        private CancellationTokenSource _cts;
        private readonly CompositeDisposable _disposables = new();

        private SteamworksService _steamworksService;


        [Inject]
        public void Construct(SteamworksService steamworksService)
        {
            _steamworksService = steamworksService;
        }

        public async UniTask StartAsync(CancellationToken cancellationToken)
        {

            
            await UniTask.WaitUntil(() => _steamworksService.IsReady, cancellationToken: cancellationToken);

        }
        
        public void OnMMEvent(MMAchievementUnlockedEvent eventType)
    {
        if(!_SteamVersion || !_initialized)
        {
            return;
        }
        
        if (string.IsNullOrEmpty(eventType.Achievement.AchievementID))
        {
            Debug.LogWarning("[MMEvents] Invalid AchievementID.");
            return;
        }

        MMQuest questFound = EditorQuestDB.LoadedQuests.FirstOrDefault(a => a.mmAchievement != null 
            && a.mmAchievement.AchievementID == eventType.Achievement.AchievementID);

            //if
        //get quest from quest repository saved

        Debug.Log("SetAchievement called " + eventType.Achievement.AchievementID);
        Achievements.SetAchievement(eventType.Achievement.AchievementID);//"ACH_AUTO_COOKER_TEST");        


        bool achieved = false;
        DateTime achieveTime;

        Achievements.GetAchievement(eventType.Achievement.AchievementID, out achieved, out achieveTime);
        //Achievements.GetAchievement(eventType.Achievement.AchievementID, out achieved);

        Debug.Log("Achievement activated? " + achieved);
        Debug.Log("Achievement activated called " + achieveTime.ToString("MM/DD/YYYY"));

        // AchievementData myAch = eventType.Achievement.AchievementID;

        // var achState = myAch.GetAchievementAndUnlockTime(user);

    }

        //call to steam to unlock achievement
        public static async void UnlockOnSteam(MMQuest completedQuest)
        {
        
        }

        public void Dispose()
        {
            _cts?.Cancel();
            _cts?.Dispose();
            _disposables.Dispose();
        }
    }
}