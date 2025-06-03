using System.Threading;
using Cysharp.Threading.Tasks;
using UnityEngine;
using VContainer;
using VContainer.Unity;

namespace KBVE.MMExtensions.SSDB.Steam
{
    public class SteamWorker : IAsyncStartable, ISteamWorker
    {
        private readonly ISteamworksService _steamworksService;
        public bool IsReady { get; private set; }
        public bool AchievementsReady { get; private set; }
        public bool FriendsReady { get; private set; }

        [Inject]
        public SteamWorker(ISteamworksService steamworksService)
        {
            _steamworksService = steamworksService;
        }

        public async UniTask StartAsync(CancellationToken cancellationToken)
        {
            await UniTask.WaitUntil(() => _steamworksService.Initialized, cancellationToken: cancellationToken);

            InitializeAchievementsAsync().Forget();
            InitializeFriendsAsync().Forget();

            IsReady = true;
        }


        private async UniTaskVoid InitializeAchievementsAsync()
        {
            try
            {
                await UniTask.RunOnThreadPool(() =>
                {
                    // Offloaded logic here (NO Unity APIs)
                    return true;
                }, cancellationToken: default);

                AchievementsReady = true;
            }
            catch
            {
                AchievementsReady = false;
            }
        }


        private async UniTaskVoid InitializeFriendsAsync()
        {
            try
            {
                await UniTask.RunOnThreadPool(() =>
                {
                    // Offloaded logic here (NO Unity APIs)
                    return true;
                }, cancellationToken: default);


                FriendsReady = true;
            }
            catch
            {
                FriendsReady = false;
            }
        }
    }
}