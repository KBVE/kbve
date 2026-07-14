
#if (UNITY_STANDALONE_WIN || UNITY_STANDALONE_LINUX || UNITY_STANDALONE_OSX) && !DISABLESTEAMWORKS

using System;
using System.Collections.Generic;
using MessagePipe;
using Steamworks;
using UnityEngine;
using VContainer.Unity;

namespace RareIcon.Platform
{
    public enum SteamAvatarSize : byte { Medium = 0, Large = 1 }

    /// <summary>Emitted when an avatar finishes async load (Steam streams from network on first request).</summary>
    public readonly struct SteamAvatarReadyMessage
    {
        public readonly ulong SteamId;
        public readonly SteamAvatarSize Size;
        public SteamAvatarReadyMessage(ulong steamId, SteamAvatarSize size) { SteamId = steamId; Size = size; }
    }

    public interface ISteamAvatarService
    {
        /// <summary>Try to fetch cached avatar. Returns null if not ready; subscribe to SteamAvatarReadyMessage for the async-complete signal.</summary>
        Texture2D TryGet(ulong steamId, SteamAvatarSize size = SteamAvatarSize.Medium);
    }

    public sealed class SteamAvatarService : ISteamAvatarService, IStartable, IDisposable
    {
        readonly IPublisher<SteamAvatarReadyMessage> _pub;
        Callback<AvatarImageLoaded_t> _cb;
        readonly Dictionary<(ulong, SteamAvatarSize), Texture2D> _cache = new();

        public SteamAvatarService(IPublisher<SteamAvatarReadyMessage> pub) { _pub = pub; }

        public void Start()
        {
            if (!SteamManager.IsReady) return;
            _cb = Callback<AvatarImageLoaded_t>.Create(OnLoaded);
        }

        public void Dispose()
        {
            _cb?.Dispose();
            foreach (var tex in _cache.Values)
                if (tex != null) UnityEngine.Object.Destroy(tex);
            _cache.Clear();
        }

        public Texture2D TryGet(ulong steamId, SteamAvatarSize size = SteamAvatarSize.Medium)
        {
            if (!SteamManager.IsReady || steamId == 0UL) return null;
            var key = (steamId, size);
            if (_cache.TryGetValue(key, out var cached) && cached != null) return cached;

            int handle = size == SteamAvatarSize.Large
                ? SteamFriends.GetLargeFriendAvatar(new CSteamID(steamId))
                : SteamFriends.GetMediumFriendAvatar(new CSteamID(steamId));

            if (handle <= 0) return null;

            var tex = DecodeImage(handle);
            if (tex != null) _cache[key] = tex;
            return tex;
        }

        void OnLoaded(AvatarImageLoaded_t evt)
        {
            ulong id = evt.m_steamID.m_SteamID;

            var size = evt.m_iWide >= 128 ? SteamAvatarSize.Large : SteamAvatarSize.Medium;
            var tex = DecodeImage(evt.m_iImage, evt.m_iWide, evt.m_iTall);
            if (tex != null)
            {
                var key = (id, size);
                if (_cache.TryGetValue(key, out var old) && old != null) UnityEngine.Object.Destroy(old);
                _cache[key] = tex;
            }
            _pub.Publish(new SteamAvatarReadyMessage(id, size));
        }

        static Texture2D DecodeImage(int handle)
        {
            if (!SteamUtils.GetImageSize(handle, out uint w, out uint h)) return null;
            return DecodeImage(handle, (int)w, (int)h);
        }

        static Texture2D DecodeImage(int handle, int w, int h)
        {
            if (w <= 0 || h <= 0) return null;
            int byteLen = w * h * 4;
            var buf = new byte[byteLen];
            if (!SteamUtils.GetImageRGBA(handle, buf, byteLen)) return null;

            FlipRowsInPlace(buf, w, h);

            var tex = new Texture2D(w, h, TextureFormat.RGBA32, mipChain: false, linear: false);
            tex.LoadRawTextureData(buf);
            tex.Apply(updateMipmaps: false, makeNoLongerReadable: true);
            return tex;
        }

        static void FlipRowsInPlace(byte[] buf, int w, int h)
        {
            int stride = w * 4;
            var row = new byte[stride];
            for (int y = 0; y < h / 2; y++)
            {
                int top = y * stride;
                int bot = (h - 1 - y) * stride;
                Buffer.BlockCopy(buf, top, row, 0, stride);
                Buffer.BlockCopy(buf, bot, buf, top, stride);
                Buffer.BlockCopy(row, 0, buf, bot, stride);
            }
        }
    }
}

#else

using UnityEngine;

namespace RareIcon.Platform
{
    public enum SteamAvatarSize : byte { Medium = 0, Large = 1 }

    public readonly struct SteamAvatarReadyMessage
    {
        public readonly ulong SteamId;
        public readonly SteamAvatarSize Size;
        public SteamAvatarReadyMessage(ulong steamId, SteamAvatarSize size) { SteamId = steamId; Size = size; }
    }

    public interface ISteamAvatarService
    {
        Texture2D TryGet(ulong steamId, SteamAvatarSize size = SteamAvatarSize.Medium);
    }

    public sealed class SteamAvatarService : ISteamAvatarService
    {
        public Texture2D TryGet(ulong steamId, SteamAvatarSize size = SteamAvatarSize.Medium) => null;
    }
}

#endif
