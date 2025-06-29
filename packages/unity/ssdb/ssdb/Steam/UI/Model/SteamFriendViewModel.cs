using System;
using UnityEngine;
using Cysharp.Threading.Tasks;
using Heathen.SteamworksIntegration;

namespace KBVE.SSDB.Steam.UI
{
    public class SteamFriendViewModel
    {
        public string Name { get; set; }
        public string Status { get; set; }
        public UniTask<Texture2D?> AvatarTask { get; set; }
        public UserData RawSteamUser { get; set; }
    }
}