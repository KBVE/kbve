using System;
using System.IO;
using UnityEngine;

namespace RareIcon
{
    /// <summary>Manages save-slot archives on top of the Rust <c>uniti_world_archive</c> / <c>uniti_world_restore</c> FFI. Each slot is a single zstd-compressed file under <c>persistentDataPath/saves/&lt;slot&gt;.world</c>. Save = flush live state + archive current SQLite DB. Load = restore archive into a temporary file + reopen the store at that path.</summary>
    public static class SaveSlotService
    {
        const string SaveDirName  = "saves";
        const string SaveExt      = ".world";

        public static string SaveDirectory =>
            Path.Combine(Application.persistentDataPath, SaveDirName);

        public static string PathForSlot(string slot) =>
            Path.Combine(SaveDirectory, slot + SaveExt);

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

        /// <summary>Forces a Unity-side live snapshot + Rust SQLite flush, then writes a compressed backup to slot file. Returns true on success.</summary>
        public static bool Save(string slot)
        {
            if (string.IsNullOrEmpty(slot)) return false;
            var nw = WorldStoreSystem.Instance;
            if (nw == null || !nw.IsValid) return false;

            var world = GameplayWorld.Resolve();
            if (world != null && world.IsCreated)
            {
                var sys = world.GetExistingSystemManaged<RustPersistenceFlushSystem>();
                sys?.ForceFlushNow($"save:{slot}");
            }

            Directory.CreateDirectory(SaveDirectory);
            var dst = PathForSlot(slot);
            bool ok = nw.Archive(dst);
            if (!ok) Debug.LogError($"[SaveSlotService] archive failed for slot '{slot}' → {dst}");
            else     Debug.Log($"[SaveSlotService] saved slot '{slot}' → {dst}");
            return ok;
        }

        /// <summary>Restores a slot archive into the live worldstore.db. The current store should be disposed BEFORE calling — ECS world won't see the change until <c>WorldStoreSystem</c> reopens it. Returns true on success.</summary>
        public static bool Restore(string slot, string liveDbPath)
        {
            if (string.IsNullOrEmpty(slot) || string.IsNullOrEmpty(liveDbPath)) return false;
            var src = PathForSlot(slot);
            if (!File.Exists(src))
            {
                Debug.LogError($"[SaveSlotService] slot '{slot}' not found at {src}");
                return false;
            }
            bool ok = Native.NativeWorld.Restore(src, liveDbPath);
            if (!ok) Debug.LogError($"[SaveSlotService] restore failed for slot '{slot}'");
            else     Debug.Log($"[SaveSlotService] restored slot '{slot}' from {src} → {liveDbPath}");
            return ok;
        }

        public static bool Delete(string slot)
        {
            var path = PathForSlot(slot);
            try { File.Delete(path); return true; }
            catch (Exception e) { Debug.LogError($"[SaveSlotService] delete failed for '{slot}': {e}"); return false; }
        }
    }
}
