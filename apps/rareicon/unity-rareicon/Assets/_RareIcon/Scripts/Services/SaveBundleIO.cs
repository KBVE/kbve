using System;
using System.IO;
using System.IO.Compression;
using UnityEngine;

namespace RareIcon
{
    /// <summary>Pack / unpack the slot bundle (zip) that wraps the JSON manifest, optional PNG thumbnail, and the Rust-emitted zstd SQLite archive into a single file. Atomic write — every Pack lands in a sibling .tmp file then File.Move's into place so a crash mid-write never leaves a half-built slot. Restore peeks the magic bytes so legacy raw-zstd slots still round-trip via <see cref="IsZipBundle"/> + <see cref="ExtractState"/> falling back to direct restore.</summary>
    public static class SaveBundleIO
    {
        public const string ManifestEntry  = "manifest.json";
        public const string ThumbnailEntry = "thumbnail.png";
        public const string StateEntry     = "state.sqlite.zst";

        static readonly byte[] ZipMagic  = { 0x50, 0x4B, 0x03, 0x04 };
        static readonly byte[] ZstdMagic = { 0x28, 0xB5, 0x2F, 0xFD };

        /// <summary>Write the slot bundle atomically to <paramref name="outPath"/>. <paramref name="stateZstPath"/> must point at a freshly-archived uniti zstd file (will be copied in, not moved). Returns true on success.</summary>
        public static bool Pack(string outPath, SaveManifest manifest, byte[] thumbnailPng, string stateZstPath)
        {
            if (string.IsNullOrEmpty(outPath) || manifest == null) return false;

            string tmp = outPath + ".tmp";
            try
            {
                if (File.Exists(tmp)) File.Delete(tmp);

                using (var fs = new FileStream(tmp, FileMode.CreateNew, FileAccess.Write))
                using (var zip = new ZipArchive(fs, ZipArchiveMode.Create, leaveOpen: false))
                {
                    var manifestEntry = zip.CreateEntry(ManifestEntry, System.IO.Compression.CompressionLevel.NoCompression);
                    using (var sw = new StreamWriter(manifestEntry.Open()))
                        sw.Write(JsonUtility.ToJson(manifest, prettyPrint: true));

                    if (thumbnailPng != null && thumbnailPng.Length > 0)
                    {
                        var thumbEntry = zip.CreateEntry(ThumbnailEntry, System.IO.Compression.CompressionLevel.NoCompression);
                        using var ts = thumbEntry.Open();
                        ts.Write(thumbnailPng, 0, thumbnailPng.Length);
                    }

                    if (!string.IsNullOrEmpty(stateZstPath) && File.Exists(stateZstPath))
                    {
                        var stateEntry = zip.CreateEntry(StateEntry, System.IO.Compression.CompressionLevel.NoCompression);
                        using var es = stateEntry.Open();
                        using var rs = File.OpenRead(stateZstPath);
                        rs.CopyTo(es);
                    }
                }

                if (File.Exists(outPath)) File.Delete(outPath);
                File.Move(tmp, outPath);
                return true;
            }
            catch (Exception e)
            {
                Debug.LogError($"[SaveBundleIO] Pack failed → {outPath}: {e.Message}");
                try { if (File.Exists(tmp)) File.Delete(tmp); } catch { }
                return false;
            }
        }

        public static bool IsZipBundle(string path)
        {
            if (!File.Exists(path)) return false;
            try
            {
                using var fs = File.OpenRead(path);
                byte[] head = new byte[4];
                int read = fs.Read(head, 0, 4);
                if (read < 4) return false;
                for (int i = 0; i < 4; i++)
                    if (head[i] != ZipMagic[i]) return false;
                return true;
            }
            catch { return false; }
        }

        public static bool IsLegacyZstd(string path)
        {
            if (!File.Exists(path)) return false;
            try
            {
                using var fs = File.OpenRead(path);
                byte[] head = new byte[4];
                int read = fs.Read(head, 0, 4);
                if (read < 4) return false;
                for (int i = 0; i < 4; i++)
                    if (head[i] != ZstdMagic[i]) return false;
                return true;
            }
            catch { return false; }
        }

        public static SaveManifest ReadManifest(string bundlePath)
        {
            if (!IsZipBundle(bundlePath)) return null;
            try
            {
                using var fs = File.OpenRead(bundlePath);
                using var zip = new ZipArchive(fs, ZipArchiveMode.Read);
                var entry = zip.GetEntry(ManifestEntry);
                if (entry == null) return null;
                using var sr = new StreamReader(entry.Open());
                return JsonUtility.FromJson<SaveManifest>(sr.ReadToEnd());
            }
            catch (Exception e)
            {
                Debug.LogError($"[SaveBundleIO] manifest read failed for {bundlePath}: {e.Message}");
                return null;
            }
        }

        public static byte[] ReadThumbnail(string bundlePath)
        {
            if (!IsZipBundle(bundlePath)) return null;
            try
            {
                using var fs = File.OpenRead(bundlePath);
                using var zip = new ZipArchive(fs, ZipArchiveMode.Read);
                var entry = zip.GetEntry(ThumbnailEntry);
                if (entry == null) return null;
                using var ms = new MemoryStream();
                using var es = entry.Open();
                es.CopyTo(ms);
                return ms.ToArray();
            }
            catch { return null; }
        }

        /// <summary>Extract the inner zstd SQLite archive to <paramref name="outZstPath"/> so the existing uniti Restore call can consume it directly. Returns true on success.</summary>
        public static bool ExtractState(string bundlePath, string outZstPath)
        {
            if (!IsZipBundle(bundlePath)) return false;
            try
            {
                using var fs = File.OpenRead(bundlePath);
                using var zip = new ZipArchive(fs, ZipArchiveMode.Read);
                var entry = zip.GetEntry(StateEntry);
                if (entry == null) return false;
                if (File.Exists(outZstPath)) File.Delete(outZstPath);
                using var ws = File.OpenWrite(outZstPath);
                using var es = entry.Open();
                es.CopyTo(ws);
                return true;
            }
            catch (Exception e)
            {
                Debug.LogError($"[SaveBundleIO] state extract failed for {bundlePath}: {e.Message}");
                return false;
            }
        }
    }
}
