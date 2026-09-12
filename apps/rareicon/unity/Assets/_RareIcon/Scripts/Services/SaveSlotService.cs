using System;
using System.Collections.Generic;
using System.IO;
using Unity.Entities;
using UnityEngine;

namespace RareIcon
{
    /// <summary>Manages save-slot bundles on top of the Rust <c>uniti_world_archive</c> / <c>uniti_world_restore</c> FFI. Each slot is a single <c>.world</c> zip under <c>persistentDataPath/saves/</c> containing manifest.json + thumbnail.png + state.sqlite.zst. Save = flush live state → archive uniti to a temp zstd → pack the bundle atomically. Restore = read manifest, run migrations, extract zstd, hand off to uniti. Legacy raw-zstd slots from before the bundle format still round-trip via the magic-byte fallback.</summary>
    public static class SaveSlotService
    {
        const string SaveDirName = "saves";
        const string SaveExt     = ".world";

        public static string SaveDirectory =>
            Path.Combine(Application.persistentDataPath, SaveDirName);

        public static string PathForSlot(string slot) =>
            Path.Combine(SaveDirectory, slot + SaveExt);

        /// <summary>One row in the slot list — manifest preview + filesystem timestamp. Loaded purely from the bundle's manifest.json so the UI stays snappy with dozens of slots.</summary>
        public readonly struct SlotInfo
        {
            public readonly string Slot;
            public readonly string Path;
            public readonly long   FileBytes;
            public readonly long   FileMtimeUnixMs;
            public readonly bool   IsLegacy;
            public readonly SaveManifest Manifest;

            public SlotInfo(string slot, string path, long bytes, long mtime, bool legacy, SaveManifest manifest)
            {
                Slot = slot; Path = path; FileBytes = bytes; FileMtimeUnixMs = mtime;
                IsLegacy = legacy; Manifest = manifest;
            }
        }

        /// <summary>Per-slot thumbnail bytes — pulled out of the bundle on demand. Null if the slot is legacy or has no thumb. Caller decodes via <see cref="Texture2D.LoadImage"/>.</summary>
        public static byte[] LoadThumbnail(string slot)
        {
            var p = PathForSlot(slot);
            return SaveBundleIO.ReadThumbnail(p);
        }

        public static string[] ListSlots()
        {
            if (!Directory.Exists(SaveDirectory)) return Array.Empty<string>();
            var files = Directory.GetFiles(SaveDirectory, "*" + SaveExt);
            var slots = new string[files.Length];
            for (int i = 0; i < files.Length; i++)
                slots[i] = Path.GetFileNameWithoutExtension(files[i]);
            Array.Sort(slots);
            return slots;
        }

        /// <summary>List slots with their manifest + file metadata for the slot-picker UI. Cheap — only reads the manifest.json entry, not the SQLite blob.</summary>
        public static SlotInfo[] ListSlotsWithMeta()
        {
            if (!Directory.Exists(SaveDirectory)) return Array.Empty<SlotInfo>();
            var files = Directory.GetFiles(SaveDirectory, "*" + SaveExt);
            var rows = new List<SlotInfo>(files.Length);
            for (int i = 0; i < files.Length; i++)
            {
                string slot = Path.GetFileNameWithoutExtension(files[i]);
                var info = new FileInfo(files[i]);
                long mtime = new DateTimeOffset(info.LastWriteTimeUtc).ToUnixTimeMilliseconds();
                bool isZip = SaveBundleIO.IsZipBundle(files[i]);
                SaveManifest manifest = isZip ? SaveBundleIO.ReadManifest(files[i]) : null;
                rows.Add(new SlotInfo(slot, files[i], info.Length, mtime, !isZip, manifest));
            }
            rows.Sort((a, b) => b.FileMtimeUnixMs.CompareTo(a.FileMtimeUnixMs));
            return rows.ToArray();
        }

        /// <summary>Forces a Unity-side live snapshot + Rust SQLite flush, archives uniti to a temp zstd, then packs the bundle. <paramref name="ctx"/> carries the Unity-side fields the manifest captures (seed, capital name, playtime) since this is a static service and can't depend on DI'd singletons. <paramref name="thumbnailPng"/> may be null. Returns true on success.</summary>
        public static bool Save(string slot, in SaveContext ctx, byte[] thumbnailPng)
        {
            if (string.IsNullOrEmpty(slot)) return false;
            var nw = WorldStoreSystem.Instance;
            if (nw == null || !nw.IsValid)
            {
                Debug.LogError("[SaveSlotService] no live worldstore");
                return false;
            }

            var world = GameplayWorld.Resolve();
            uint turn = 0;
            double absSec = 0;
            if (world != null && world.IsCreated)
            {
                var sys = world.GetExistingSystemManaged<RustPersistenceFlushSystem>();
                sys?.ForceFlushNow($"save:{slot}");

                using var clkQ = world.EntityManager.CreateEntityQuery(ComponentType.ReadOnly<WorldClock>());
                if (!clkQ.IsEmpty)
                {
                    var clk = clkQ.GetSingleton<WorldClock>();
                    turn = clk.TurnIndex;
                    absSec = clk.AbsSeconds;
                }
            }

            Directory.CreateDirectory(SaveDirectory);
            string tmpZst = Path.Combine(SaveDirectory, "." + slot + ".tmp.zst");
            if (!nw.Archive(tmpZst))
            {
                Debug.LogError($"[SaveSlotService] uniti archive failed → {tmpZst}");
                return false;
            }

            var manifest = SaveManifest.CreateNow(
                slot:           slot,
                seed:           ctx.Seed,
                turnIndex:      turn,
                absSeconds:     absSec,
                capitalName:    ctx.CapitalName,
                gameVersion:    Application.version,
                playtimeSeconds: ctx.PlaytimeSeconds);

            string dst = PathForSlot(slot);
            bool ok = SaveBundleIO.Pack(dst, manifest, thumbnailPng, tmpZst);
            try { File.Delete(tmpZst); } catch { }

            if (ok)
            {
                Debug.Log($"[SaveSlotService] saved slot '{slot}' → {dst}");

                SteamCloudSync.Upload(dst, slot + SaveExt);
            }
            else
            {
                Debug.LogError($"[SaveSlotService] bundle pack failed for slot '{slot}' → {dst}");
            }
            return ok;
        }

        /// <summary>Restores the slot bundle into <paramref name="liveDbPath"/>. Reads the manifest, runs <see cref="SaveMigrations"/>, extracts the inner zstd, and calls uniti. Falls back to the pre-bundle raw-zstd path for legacy slots so old saves keep working. Returns true on success.</summary>
        public static bool Restore(string slot, string liveDbPath, out string failureReason)
        {
            failureReason = null;
            if (string.IsNullOrEmpty(slot) || string.IsNullOrEmpty(liveDbPath))
            {
                failureReason = "missing slot or live DB path";
                return false;
            }

            string src = PathForSlot(slot);
            if (!File.Exists(src))
            {
                failureReason = "slot file missing";
                return false;
            }

            if (SaveBundleIO.IsZipBundle(src))
            {
                var manifest = SaveBundleIO.ReadManifest(src);
                if (manifest == null)
                {
                    failureReason = "manifest unreadable";
                    return false;
                }
                if (!SaveMigrations.TryMigrate(manifest, out failureReason))
                {
                    SaveMigrations.LogIfBlocked(manifest, failureReason);
                    return false;
                }

                Directory.CreateDirectory(SaveDirectory);
                string tmpZst = Path.Combine(SaveDirectory, "." + slot + ".restore.zst");
                if (!SaveBundleIO.ExtractState(src, tmpZst))
                {
                    failureReason = "zstd extract failed";
                    return false;
                }
                bool ok = Native.NativeWorld.Restore(tmpZst, liveDbPath);
                try { File.Delete(tmpZst); } catch { }
                if (!ok) { failureReason = "uniti restore failed"; return false; }
                Debug.Log($"[SaveSlotService] restored slot '{slot}' (schema v{manifest.SchemaVersion})");
                return true;
            }

            if (SaveBundleIO.IsLegacyZstd(src))
            {
                bool ok = Native.NativeWorld.Restore(src, liveDbPath);
                if (!ok) { failureReason = "legacy uniti restore failed"; return false; }
                Debug.Log($"[SaveSlotService] restored legacy slot '{slot}'");
                return true;
            }

            failureReason = "unknown bundle format";
            return false;
        }

        public static bool Restore(string slot, string liveDbPath)
            => Restore(slot, liveDbPath, out _);

        public static bool Delete(string slot)
        {
            var path = PathForSlot(slot);
            try
            {
                File.Delete(path);
                SteamCloudSync.Delete(slot + SaveExt);
                return true;
            }
            catch (Exception e) { Debug.LogError($"[SaveSlotService] delete failed for '{slot}': {e}"); return false; }
        }
    }

    /// <summary>Caller-provided context for <see cref="SaveSlotService.Save"/> — Unity-side fields the manifest captures that aren't reachable from a static service. Built by the DI'd UI tab from injected services (WorldGenSession seed, capital lookup).</summary>
    public readonly struct SaveContext
    {
        public readonly int    Seed;
        public readonly string CapitalName;
        public readonly double PlaytimeSeconds;

        public SaveContext(int seed, string capitalName, double playtimeSeconds)
        {
            Seed            = seed;
            CapitalName     = capitalName ?? string.Empty;
            PlaytimeSeconds = playtimeSeconds;
        }
    }
}
