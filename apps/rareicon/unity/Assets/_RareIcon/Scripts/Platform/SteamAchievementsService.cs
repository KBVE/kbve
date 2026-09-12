
#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS

using System;
using Steamworks;
using UnityEngine;
using VContainer.Unity;

namespace RareIcon.Platform
{
    public interface ISteamAchievementsService
    {
        bool IsUnlocked(string apiName);
        void Unlock(string apiName);
        void Clear(string apiName);
        void SetStatInt(string apiName, int value);
        void SetStatFloat(string apiName, float value);
        bool GetStatInt(string apiName, out int value);
        bool GetStatFloat(string apiName, out float value);
        void Flush();
    }

    public sealed class SteamAchievementsService : ISteamAchievementsService, IStartable, IDisposable
    {
        Callback<UserStatsReceived_t> _cbReceived;
        bool _statsReady;

        public void Start()
        {
            if (!SteamManager.IsReady) return;

            _cbReceived = Callback<UserStatsReceived_t>.Create(OnReceived);
        }

        public void Dispose() => _cbReceived?.Dispose();

        public bool IsUnlocked(string apiName)
        {
            if (!Ready()) return false;
            return SteamUserStats.GetAchievement(apiName, out bool unlocked) && unlocked;
        }

        public void Unlock(string apiName)
        {
            if (!Ready()) return;
            if (IsUnlocked(apiName)) return;
            if (SteamUserStats.SetAchievement(apiName)) Flush();
            else Debug.LogWarning($"[SteamAch] SetAchievement('{apiName}') failed — name mismatch in Partner portal?");
        }

        public void Clear(string apiName)
        {
            if (!Ready()) return;
            if (SteamUserStats.ClearAchievement(apiName)) Flush();
        }

        public void SetStatInt(string apiName, int value)
        {
            if (!Ready()) return;
            if (SteamUserStats.SetStat(apiName, value)) Flush();
        }

        public void SetStatFloat(string apiName, float value)
        {
            if (!Ready()) return;
            if (SteamUserStats.SetStat(apiName, value)) Flush();
        }

        public bool GetStatInt(string apiName, out int value)
        {
            value = 0;
            return Ready() && SteamUserStats.GetStat(apiName, out value);
        }

        public bool GetStatFloat(string apiName, out float value)
        {
            value = 0f;
            return Ready() && SteamUserStats.GetStat(apiName, out value);
        }

        public void Flush()
        {
            if (Ready()) SteamUserStats.StoreStats();
        }

        bool Ready() => SteamManager.IsReady && _statsReady;

        void OnReceived(UserStatsReceived_t evt)
        {
            if (evt.m_eResult != EResult.k_EResultOK) return;
            if (evt.m_steamIDUser != SteamUser.GetSteamID()) return;
            _statsReady = true;
        }
    }
}

#else

namespace RareIcon.Platform
{
    public interface ISteamAchievementsService
    {
        bool IsUnlocked(string apiName);
        void Unlock(string apiName);
        void Clear(string apiName);
        void SetStatInt(string apiName, int value);
        void SetStatFloat(string apiName, float value);
        bool GetStatInt(string apiName, out int value);
        bool GetStatFloat(string apiName, out float value);
        void Flush();
    }

    public sealed class SteamAchievementsService : ISteamAchievementsService
    {
        public bool IsUnlocked(string apiName) => false;
        public void Unlock(string apiName) { }
        public void Clear(string apiName) { }
        public void SetStatInt(string apiName, int value) { }
        public void SetStatFloat(string apiName, float value) { }
        public bool GetStatInt(string apiName, out int value)   { value = 0;  return false; }
        public bool GetStatFloat(string apiName, out float value) { value = 0f; return false; }
        public void Flush() { }
    }
}

#endif
