#if !UNITY_WEBGL && !UNITY_IOS && !UNITY_ANDROID

using System;
using System.Threading;
using System.Linq;
using System.Collections.Generic;
using System.Collections.Concurrent;
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
using KBVE.MMExtensions.Orchestrator.Core.UI;
using KBVE.MMExtensions.Orchestrator.Interfaces;
using Heathen.SteamworksIntegration;
using Heathen.SteamworksIntegration.UI;
using API = Heathen.SteamworksIntegration.API;
using KBVE.SSDB.Steam.UI;
using Steamworks;
//using TMPro;

namespace KBVE.SSDB.Steam
{
        public partial class SteamUserProfiles : MonoBehaviour, IAsyncStartable, IDisposable //IUserProfile
        {

            private readonly CompositeDisposable _disposables = new CompositeDisposable();
            private CancellationTokenSource _cts;
            private SteamworksService _steamworksService;
            
            // Thread-safe Reactive Properties for OneJS
            // Using nullable wrapper since UserData can't be null
            public readonly SynchronizedReactiveProperty<UserData?> LocalUser = new(null);
            public readonly SynchronizedReactiveProperty<string> UserName = new(string.Empty);
            public readonly SynchronizedReactiveProperty<string> UserStatus = new("Offline");
            public readonly SynchronizedReactiveProperty<Texture2D> UserAvatar = new(null);
            public readonly SynchronizedReactiveProperty<string> UserSteamId = new(string.Empty);
            public readonly SynchronizedReactiveProperty<bool> IsOnline = new(false);
            
            // Additional Steam API data
            public readonly SynchronizedReactiveProperty<int> UserLevel = new(0);
            public readonly SynchronizedReactiveProperty<string> UserCountry = new(string.Empty);
            public readonly SynchronizedReactiveProperty<string> UserState = new(string.Empty);
            public readonly SynchronizedReactiveProperty<string> UserCity = new(string.Empty);
            public readonly SynchronizedReactiveProperty<bool> IsInGame = new(false);
            public readonly SynchronizedReactiveProperty<string> CurrentGameName = new(string.Empty);
            public readonly SynchronizedReactiveProperty<ulong> CurrentGameId = new(0);
            public readonly SynchronizedReactiveProperty<int> FriendCount = new(0);
            public readonly SynchronizedReactiveProperty<float> AccountAge = new(0f);
            public readonly SynchronizedReactiveProperty<bool> IsVacBanned = new(false);
            public readonly SynchronizedReactiveProperty<bool> IsCommunityBanned = new(false);
            public readonly SynchronizedReactiveProperty<bool> IsTradeBanned = new(false);
            
            // Events for OneJS interaction (fired on value changes)
            public event Action<UserData> OnLocalUserLoaded;
            public event Action<string> OnUserNameChanged;
            public event Action<string> OnUserStatusChanged;
            public event Action<Texture2D> OnAvatarLoaded;
            
            // Steam ID to Username cache
            private readonly ConcurrentDictionary<ulong, CachedUserInfo> _userCache = new();
            private readonly TimeSpan _cacheExpiration = TimeSpan.FromMinutes(30); // Cache for 30 minutes
            
            // Cached user info structure
            private class CachedUserInfo
            {
                public string Username { get; set; }
                public string DisplayName { get; set; }
                public DateTime CachedAt { get; set; }
                public bool IsLoading { get; set; }
                
                public bool IsExpired => DateTime.UtcNow - CachedAt > TimeSpan.FromMinutes(30);
            }

            [Inject]
            public void Construct(SteamworksService steamworksService)
            {
                _steamworksService = steamworksService;
            }

            public async UniTask StartAsync(CancellationToken cancellationToken)
            {
                _cts = new CancellationTokenSource();
                var linkedToken = CancellationTokenSource.CreateLinkedTokenSource(_cts.Token, cancellationToken).Token;

                try
                {
                    // Wait for SteamworksService readiness
                    await UniTask.WaitUntil(() => _steamworksService.IsReady, cancellationToken: linkedToken);

               

                    Debug.Log("[SteamUserProfiles] Services ready, loading user data...");

                    // Load user data for OneJS access
                    await LoadUserDataAsync(linkedToken);
                    
                
                    
                    // Subscribe to Steam user changes
                    SubscribeToUserUpdates();
                }
                catch (OperationCanceledException)
                {
                    Debug.LogWarning("[SteamUserProfiles] Initialization canceled.");
                }
            }

            private async UniTask LoadUserDataAsync(CancellationToken token)
            {
                var localUserNullable = _steamworksService.LocalUser.Value;
                if (localUserNullable is not UserData localUser)
                {
                    Debug.LogWarning("[SteamUserProfiles] No local user found.");
                    return;
                }

                // Update reactive properties (automatically thread-safe)
                LocalUser.Value = localUser;
                UserName.Value = localUser.Name;
                UserStatus.Value = localUser.State.ToString();
                UserSteamId.Value = localUser.id.ToString();
                IsOnline.Value = localUser.State == EPersonaState.k_EPersonaStateOnline;
                IsInGame.Value = localUser.InGame;
                
                // Get additional user data if available
                UserLevel.Value = localUser.Level;
                
                // Load extended user data
                LoadExtendedUserData(localUser);
                
                // Fire events on main thread
                await UniTask.SwitchToMainThread();
                OnLocalUserLoaded?.Invoke(localUser);
                OnUserNameChanged?.Invoke(localUser.Name);
                OnUserStatusChanged?.Invoke(localUser.State.ToString());
                
                // Load avatar asynchronously
                await LoadAvatarAsync(localUser, token);
            }
            
            private async UniTask LoadAvatarAsync(UserData user, CancellationToken token)
            {
                var tcs = new UniTaskCompletionSource<Texture2D>();
                user.LoadAvatar(texture => 
                {
                    if (texture != null)
                    {
                        // Update reactive property (automatically thread-safe)
                        UserAvatar.Value = texture;
                        
                        // Fire event on main thread
                        UniTask.Post(() => OnAvatarLoaded?.Invoke(texture));
                        tcs.TrySetResult(texture);
                    }
                    else
                    {
                        tcs.TrySetCanceled();
                    }
                });
                
                await tcs.Task.SuppressCancellationThrow();
            }
            
            
            
            private void SubscribeToUserUpdates()
            {
                // Subscribe to Steam user updates
                _steamworksService.LocalUser
                    .Subscribe(userDataNullable =>
                    {
                        if (userDataNullable is UserData userData)
                        {
                            // Update reactive properties
                            LocalUser.Value = userData;
                            UserName.Value = userData.Name;
                            UserStatus.Value = userData.State.ToString();
                            UserSteamId.Value = userData.id.ToString();
                            IsOnline.Value = userData.State == EPersonaState.k_EPersonaStateOnline;
                            IsInGame.Value = userData.InGame;
                            UserLevel.Value = userData.Level;
                            
                            // Update extended data
                            LoadExtendedUserData(userData);
                        }
                        else
                        {
                            // Handle null user
                            LocalUser.Value = null;
                            UserName.Value = string.Empty;
                            UserStatus.Value = "Offline";
                            UserSteamId.Value = string.Empty;
                            IsOnline.Value = false;
                        }
                    })
                    .AddTo(_disposables);
                    
                // Subscribe to reactive property changes to fire events
                UserName.Subscribe(name => 
                {
                    if (!string.IsNullOrEmpty(name))
                        UniTask.Post(() => OnUserNameChanged?.Invoke(name));
                }).AddTo(_disposables);
                
                UserStatus.Subscribe(status => 
                {
                    if (!string.IsNullOrEmpty(status))
                        UniTask.Post(() => OnUserStatusChanged?.Invoke(status));
                }).AddTo(_disposables);
                
                UserAvatar.Subscribe(avatar => 
                {
                    if (avatar != null)
                        UniTask.Post(() => OnAvatarLoaded?.Invoke(avatar));
                }).AddTo(_disposables);
            }
            
            // Public methods for OneJS to call (thread-safe via ReactiveProperties)
            public void RefreshUserData()
            {
                if (LocalUser.Value != null)
                {
                    UniTask.Void(async () => await LoadUserDataAsync(_cts.Token));
                }
            }
            
            public void RefreshAvatar()
            {
                var localUser = LocalUser.Value;
                if (localUser.HasValue)
                {
                    UniTask.Void(async () => await LoadAvatarAsync(localUser.Value, _cts.Token));
                }
            }
            
            // Convenience getters for OneJS (read from reactive properties)
            public string GetUserSteamId() => UserSteamId.Value;
            public string GetUserName() => UserName.Value;
            public string GetUserStatus() => UserStatus.Value;
            public bool GetIsOnline() => IsOnline.Value;
            public Texture2D GetUserAvatar() => UserAvatar.Value;
            
            // Observable subscriptions for OneJS
            public IDisposable SubscribeToUserName(Action<string> callback)
            {
                return UserName.Subscribe(callback);
            }
            
            public IDisposable SubscribeToUserStatus(Action<string> callback)
            {
                return UserStatus.Subscribe(callback);
            }
            
            public IDisposable SubscribeToAvatar(Action<Texture2D> callback)
            {
                return UserAvatar.Subscribe(callback);
            }


            /// <summary>
            /// Async method to get username from Steam ID with caching
            /// </summary>
            /// <param name="steamId">The Steam ID (can be with or without 'S' prefix)</param>
            /// <returns>The username or null if not found</returns>
            public async UniTask<string> GetUsernameFromSteamIdAsync(string steamId, CancellationToken cancellationToken = default)
            {
                try
                {
                    // Clean the Steam ID (remove 'S' prefix if present)
                    var cleanId = steamId.StartsWith("S") ? steamId.Substring(1) : steamId;
                    
                    // Parse the Steam ID
                    if (!ulong.TryParse(cleanId, out var steamIdNum))
                    {
                        Debug.LogWarning($"[SteamUserProfiles] Invalid Steam ID format: {steamId}");
                        return null;
                    }
                    
                    // Validate Steam ID format (optional but recommended)
                    if (!IsValidSteamId(steamIdNum))
                    {
                        Debug.LogWarning($"[SteamUserProfiles] Steam ID doesn't match expected format (17 digits starting with 76561): {steamId}");
                        // Continue anyway in case it's a valid but non-standard ID
                    }
                    
                    // Check if it's the local user
                    if (LocalUser.Value?.id.ToString() == cleanId)
                    {
                        return UserName.Value;
                    }
                    
                    // Check cache first
                    if (_userCache.TryGetValue(steamIdNum, out var cachedInfo))
                    {
                        if (!cachedInfo.IsExpired)
                        {
                            Debug.Log($"[SteamUserProfiles] Cache hit for Steam ID {steamIdNum}: {cachedInfo.DisplayName}");
                            return cachedInfo.DisplayName;
                        }
                        
                        // If expired but still loading, wait a bit
                        if (cachedInfo.IsLoading)
                        {
                            await UniTask.Delay(100, cancellationToken: cancellationToken);
                            if (_userCache.TryGetValue(steamIdNum, out cachedInfo) && !cachedInfo.IsExpired)
                            {
                                return cachedInfo.DisplayName;
                            }
                        }
                    }
                    
                    // Mark as loading to prevent duplicate requests
                    _userCache.AddOrUpdate(steamIdNum, 
                        new CachedUserInfo { IsLoading = true, CachedAt = DateTime.UtcNow },
                        (key, existing) => { existing.IsLoading = true; return existing; });
                    
                    // Fetch from Steam API off the main thread
                    var username = await FetchUsernameFromSteamAPIAsync(steamIdNum, cancellationToken);
                    
                    // Update cache
                    _userCache.AddOrUpdate(steamIdNum,
                        new CachedUserInfo 
                        { 
                            Username = username ?? $"S{steamIdNum}",
                            DisplayName = username ?? $"Unknown ({steamIdNum})",
                            CachedAt = DateTime.UtcNow,
                            IsLoading = false
                        },
                        (key, existing) => 
                        {
                            existing.Username = username ?? $"S{steamIdNum}";
                            existing.DisplayName = username ?? $"Unknown ({steamIdNum})";
                            existing.CachedAt = DateTime.UtcNow;
                            existing.IsLoading = false;
                            return existing;
                        });
                    
                    return username;
                }
                catch (Exception ex)
                {
                    Debug.LogError($"[SteamUserProfiles] Error getting username for Steam ID {steamId}: {ex.Message}");
                    return null;
                }
            }
            
            /// <summary>
            /// Fetch username from Steam API (runs off main thread)
            /// Uses simplified Steam ID approach with U64 (17-digit Steam IDs)
            /// </summary>
            private async UniTask<string> FetchUsernameFromSteamAPIAsync(ulong steamId, CancellationToken cancellationToken)
            {
                try
                {
                    // Switch to thread pool for Steam API call
                    await UniTask.SwitchToThreadPool();
                    
                    // For now, we'll create a simple fallback system
                    // In a full implementation, you could:
                    // 1. Use Steam Web API (requires API key)
                    // 2. Query friends list if they're a friend
                    // 3. Use third-party services
                    
                    Debug.Log($"[SteamUserProfiles] Attempting to fetch username for Steam ID: {steamId}");
                    
                    // Simulate network delay
                    await UniTask.Delay(UnityEngine.Random.Range(100, 500), cancellationToken: cancellationToken);
                    
                    // Switch back to main thread
                    await UniTask.SwitchToMainThread();
                    
                    // For now, return null - this will trigger the "Unknown" fallback
                    // TODO: Implement actual Steam Web API integration or friend list lookup
                    Debug.Log($"[SteamUserProfiles] No username found for Steam ID {steamId} - using fallback");
                    return null;
                }
                catch (Exception ex)
                {
                    Debug.LogError($"[SteamUserProfiles] Steam API error for ID {steamId}: {ex.Message}");
                    
                    // Make sure we're back on main thread
                    await UniTask.SwitchToMainThread();
                    return null;
                }
            }
            
            /// <summary>
            /// Helper method to validate Steam ID format (17-digit U64)
            /// </summary>
            private bool IsValidSteamId(ulong steamId)
            {
                // Steam IDs are typically 17 digits and start with 76561
                var steamIdStr = steamId.ToString();
                return steamIdStr.Length == 17 && steamIdStr.StartsWith("76561");
            }
            
            /// <summary>
            /// Clear the username cache
            /// </summary>
            public void ClearUsernameCache()
            {
                _userCache.Clear();
                Debug.Log("[SteamUserProfiles] Username cache cleared");
            }
            
            /// <summary>
            /// Get cache statistics for debugging
            /// </summary>
            public (int totalEntries, int validEntries, int expiredEntries) GetCacheStats()
            {
                var total = _userCache.Count;
                var valid = _userCache.Count(kvp => !kvp.Value.IsExpired && !kvp.Value.IsLoading);
                var expired = _userCache.Count(kvp => kvp.Value.IsExpired);
                return (total, valid, expired);
            }
            
            private void LoadExtendedUserData(UserData user)
            {
                // Get friend count from Steam API
                try
                {
                    var friendCount = SteamFriends.GetFriendCount(EFriendFlags.k_EFriendFlagImmediate);
                    FriendCount.Value = friendCount;
                }
                catch (System.Exception ex)
                {
                    Debug.LogWarning($"[SteamUserProfiles] Failed to get friend count: {ex.Message}");
                    FriendCount.Value = 0;
                }
                
                // Handle game info if user is in game
                try
                {
                    if (user.InGame)
                    {
                        var gameInfo = user.GameInfo;
                        if (gameInfo.Game.IsValid)
                        {
                            // Use the app name if available, otherwise fallback
                            var gameName = !string.IsNullOrEmpty(gameInfo.Game.Name) ? gameInfo.Game.Name : "Playing Game";
                            CurrentGameName.Value = gameName;
                            CurrentGameId.Value = gameInfo.Game.App.Id;
                        }
                        else
                        {
                            CurrentGameName.Value = "In Game";
                            CurrentGameId.Value = 0;
                        }
                    }
                    else
                    {
                        CurrentGameName.Value = string.Empty;
                        CurrentGameId.Value = 0;
                    }
                }
                catch (System.Exception ex)
                {
                    Debug.LogWarning($"[SteamUserProfiles] Failed to get game info: {ex.Message}");
                    CurrentGameName.Value = string.Empty;
                    CurrentGameId.Value = 0;
                }
            }
            
            public void Dispose()
            {
                _cts?.Cancel();
                _cts?.Dispose();
                _disposables.Dispose();
                
                // Dispose reactive properties
                LocalUser?.Dispose();
                UserName?.Dispose();
                UserStatus?.Dispose();
                UserAvatar?.Dispose();
                UserSteamId?.Dispose();
                IsOnline?.Dispose();
                UserLevel?.Dispose();
                UserCountry?.Dispose();
                UserState?.Dispose();
                UserCity?.Dispose();
                IsInGame?.Dispose();
                CurrentGameName?.Dispose();
                CurrentGameId?.Dispose();
                FriendCount?.Dispose();
                AccountAge?.Dispose();
                IsVacBanned?.Dispose();
                IsCommunityBanned?.Dispose();
                IsTradeBanned?.Dispose();
            }
            

        }

}

#endif