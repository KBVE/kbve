using System;
using System.Threading.Tasks;
using Cysharp.Threading.Tasks;
using Heathen.SteamworksIntegration;

namespace KBVE.SSDB.Steam.UI
{
    public class SteamFriendViewModel
    {
        public string Name { get; init; }
        public string Status { get; init; }
        public UniTask<Texture2D?> AvatarTask { get; init; }
        public UserData RawSteamUser { get; init; }
    }
}