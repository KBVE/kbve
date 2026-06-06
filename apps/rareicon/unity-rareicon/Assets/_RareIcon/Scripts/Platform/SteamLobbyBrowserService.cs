
#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS

using System;
using System.Collections.Generic;
using MessagePipe;
using Steamworks;
using VContainer.Unity;

namespace RareIcon.Platform
{
    public readonly struct SteamLobbyBrowserEntry
    {
        public readonly ulong  LobbyId;
        public readonly ulong  OwnerSteamId;
        public readonly int    MemberCount;
        public readonly int    MemberLimit;
        public readonly string Name;
        public SteamLobbyBrowserEntry(ulong lobbyId, ulong ownerSteamId, int members, int limit, string name)
        {
            LobbyId = lobbyId; OwnerSteamId = ownerSteamId;
            MemberCount = members; MemberLimit = limit; Name = name;
        }
    }

    public readonly struct SteamLobbyBrowserResultMessage
    {
        public readonly IReadOnlyList<SteamLobbyBrowserEntry> Entries;
        public SteamLobbyBrowserResultMessage(IReadOnlyList<SteamLobbyBrowserEntry> entries) { Entries = entries; }
    }

    public enum SteamLobbyDistance : byte
    {
        Close     = 0,
        Default   = 1,
        Far       = 2,
        Worldwide = 3,
    }

    public interface ISteamLobbyBrowserService
    {
        IReadOnlyList<SteamLobbyBrowserEntry> LastResults { get; }
        /// <summary>Fire-and-forget request. Result arrives via SteamLobbyBrowserResultMessage. Key/value filter pairs are optional — pass null/empty for no filter.</summary>
        void Refresh(SteamLobbyDistance distance = SteamLobbyDistance.Default, int maxResults = 64,
                     IReadOnlyDictionary<string, string> stringFilters = null);
    }

    public sealed class SteamLobbyBrowserService : ISteamLobbyBrowserService, IStartable, IDisposable
    {
        readonly IPublisher<SteamLobbyBrowserResultMessage> _pub;
        CallResult<LobbyMatchList_t> _pending;
        List<SteamLobbyBrowserEntry> _lastResults = new();

        public IReadOnlyList<SteamLobbyBrowserEntry> LastResults => _lastResults;

        public SteamLobbyBrowserService(IPublisher<SteamLobbyBrowserResultMessage> pub) { _pub = pub; }

        public void Start()
        {
            if (!SteamManager.IsReady) return;
            _pending = CallResult<LobbyMatchList_t>.Create(OnResult);
        }

        public void Dispose() => _pending?.Cancel();

        public void Refresh(SteamLobbyDistance distance = SteamLobbyDistance.Default, int maxResults = 64,
                            IReadOnlyDictionary<string, string> stringFilters = null)
        {
            if (!SteamManager.IsReady) return;

            if (stringFilters != null)
                foreach (var (k, v) in stringFilters)
                    SteamMatchmaking.AddRequestLobbyListStringFilter(k, v, ELobbyComparison.k_ELobbyComparisonEqual);

            SteamMatchmaking.AddRequestLobbyListDistanceFilter((ELobbyDistanceFilter)distance);
            SteamMatchmaking.AddRequestLobbyListResultCountFilter(maxResults);

            var handle = SteamMatchmaking.RequestLobbyList();
            _pending.Set(handle);
        }

        void OnResult(LobbyMatchList_t evt, bool ioFailure)
        {
            _lastResults = new List<SteamLobbyBrowserEntry>((int)evt.m_nLobbiesMatching);
            if (ioFailure) { _pub.Publish(new SteamLobbyBrowserResultMessage(_lastResults)); return; }

            for (uint i = 0; i < evt.m_nLobbiesMatching; i++)
            {
                var id = SteamMatchmaking.GetLobbyByIndex((int)i);
                _lastResults.Add(new SteamLobbyBrowserEntry(
                    id.m_SteamID,
                    SteamMatchmaking.GetLobbyOwner(id).m_SteamID,
                    SteamMatchmaking.GetNumLobbyMembers(id),
                    SteamMatchmaking.GetLobbyMemberLimit(id),
                    SteamMatchmaking.GetLobbyData(id, "name") ?? string.Empty));
            }
            _pub.Publish(new SteamLobbyBrowserResultMessage(_lastResults));
        }
    }
}

#else

using System.Collections.Generic;

namespace RareIcon.Platform
{
    public readonly struct SteamLobbyBrowserEntry
    {
        public readonly ulong  LobbyId;
        public readonly ulong  OwnerSteamId;
        public readonly int    MemberCount;
        public readonly int    MemberLimit;
        public readonly string Name;
        public SteamLobbyBrowserEntry(ulong lobbyId, ulong ownerSteamId, int members, int limit, string name)
        {
            LobbyId = lobbyId; OwnerSteamId = ownerSteamId;
            MemberCount = members; MemberLimit = limit; Name = name;
        }
    }

    public readonly struct SteamLobbyBrowserResultMessage
    {
        public readonly IReadOnlyList<SteamLobbyBrowserEntry> Entries;
        public SteamLobbyBrowserResultMessage(IReadOnlyList<SteamLobbyBrowserEntry> entries) { Entries = entries; }
    }

    public enum SteamLobbyDistance : byte { Close, Default, Far, Worldwide }

    public interface ISteamLobbyBrowserService
    {
        IReadOnlyList<SteamLobbyBrowserEntry> LastResults { get; }
        void Refresh(SteamLobbyDistance distance = SteamLobbyDistance.Default, int maxResults = 64,
                     IReadOnlyDictionary<string, string> stringFilters = null);
    }

    public sealed class SteamLobbyBrowserService : ISteamLobbyBrowserService
    {
        static readonly IReadOnlyList<SteamLobbyBrowserEntry> _empty = new List<SteamLobbyBrowserEntry>();
        public IReadOnlyList<SteamLobbyBrowserEntry> LastResults => _empty;
        public void Refresh(SteamLobbyDistance distance = SteamLobbyDistance.Default, int maxResults = 64,
                            IReadOnlyDictionary<string, string> stringFilters = null) { }
    }
}

#endif
