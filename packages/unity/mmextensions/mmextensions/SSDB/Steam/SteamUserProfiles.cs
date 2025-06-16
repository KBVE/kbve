using System;
using System.Threading;
using System.Linq;
using Cysharp.Threading.Tasks;
//using Cysharp.Threading.Tasks.Addressables;
using UnityEngine;
using VContainer;
using VContainer.Unity;
using R3;
using ObservableCollections;
using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using KBVE.MMExtensions.Quests;
using Achievements = Heathen.SteamworksIntegration.API.StatsAndAchievements.Client;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;
using KBVE.MMExtensions.Orchestrator;
using KBVE.MMExtensions.Orchestrator.Core;
using Heathen.SteamworksIntegration;
using Heathen.SteamworksIntegration.UI;
using API = Heathen.SteamworksIntegration.API;
using TMPro;

namespace KBVE.MMExtensions.SSDB.Steam
{
        public class SteamUserProfiles : MonoBehaviour, IUserProfile, IAsyncStartable, IDisposable
        {

            public UnityEngine.UI.Image AvatarImage;
            public TMPro.TMP_Text StatusText;
            public TMPro.TMP_Text NameText;

            // Holy Byte Memes

            private ReactiveProperty<string> _lastStatus = new(string.Empty);
            private ReactiveProperty<string> _lastName = new(string.Empty);
            private ReactiveProperty<Texture2D?> _lastAvatar = new(null);

            private readonly CompositeDisposable _disposables = new();

            private CancellationTokenSource _cts;

            private SteamworksService _steamworksService;

            public UserData UserData { get; set; }

            private UserData currentUser;

            [Inject]
            public void Construct(SteamworksService steamworksService)
            {
                _steamworksService = steamworksService;
            }

            public async UniTask StartAsync(CancellationToken cancellationToken)
            {
                 _cts = new CancellationTokenSource();
                var linkedToken = CancellationTokenSource.CreateLinkedTokenSource(_cts.Token, cancellationToken).Token;

                try {
                    await UniTask.WhenAll(
                    UniTask.WaitUntil(() => _steamworksService.IsReady, cancellationToken: linkedToken),
                    Operator.R()
                    );
                }
                catch (OperationCanceledException)
                    {
                        Debug.LogWarning("[SteamUserProfiles] Initialization canceled.");
                    }

                //Heathen.SteamworksIntegration.UserData? localUser = _steamworksService.LocalUser.Value;
                var localUserNullable = _steamworksService.LocalUser.Value;

                if (localUserNullable is { } localUser)
                {
                    Debug.Log($"Local User {localUser.AccountId}");

                    NameText.text = localUser.Name; // or .Name if your custom wrapper exposes that
                    StatusText.text = localUser.State.ToString();

                     localUser.LoadAvatar(texture =>
                    {
                        AvatarImage.sprite = Sprite.Create(
                            texture,
                            new Rect(0, 0, texture.width, texture.height),
                            new Vector2(0.5f, 0.5f)
                        );
                    });

                    _lastStatus.Value = localUser.State.ToString();


                    // Subscription for the Names
                    // _steamworksService.LocalUser
                    //     .Where(user => user != null)
                    //     .Subscribe(user =>
                    //     {
                    //         NameText.text = user.Name;
                    //         StatusText.text = user.State.ToString();

                    //         user.LoadAvatar(texture =>
                    //         {
                    //             AvatarImage.sprite = Sprite.Create(texture, new Rect(0, 0, texture.width, texture.height), Vector2.one * 0.5f);
                    //         });
                    //     })
                    //     .AddTo(_disposables);



                    Apply(localUser);
                }
                // var user = API.User.Client.Id;
                // Apply(user);
            }

             public void Dispose()
            {

                _cts?.Cancel();
                _cts?.Dispose();
                _disposables.Dispose();
            }
            
            public void Apply(UserData user)
            {
                currentUser = user;
                if (!currentUser.RequestInformation())
                    UpdateUserData();
            }

            private void UpdateUserData()
            {
                if (!currentUser.IsValid)
                {
                    Debug.LogWarning("Current user was not valid, returning before update");
                    return;
                }

                NameText.text = currentUser.Name;

                var inGame = currentUser.GetGamePlayed(out FriendGameInfo gameInfo);
                var inThisGame = inGame && gameInfo.Game.App == API.App.Client.Id;
                var state = currentUser.State;

                string gameName = "Not in game";
                if(gameInfo.Game != null)
                    gameName = "Playing " + gameInfo.Game.Name;

                StatusText.text = gameName;

            }

        }

}