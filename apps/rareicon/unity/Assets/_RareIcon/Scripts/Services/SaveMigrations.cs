using UnityEngine;

namespace RareIcon
{
    /// <summary>Scaffold for the save-migration pipeline. Restore reads the bundle's <see cref="SaveManifest"/>, hands it here, and the chain rewrites it forward through any necessary version steps before the SQLite archive is restored. Today there are no migrations — every shipped slot is at <see cref="SaveManifest.CurrentSchemaVersion"/>. Add a step here when the schema breaks; pre-existing slots keep round-tripping cleanly.</summary>
    public static class SaveMigrations
    {
        /// <summary>True if <paramref name="manifest"/>'s schema is something this build can understand (after running migrations). False = abort restore with a "save too new / too old" toast.</summary>
        public static bool TryMigrate(SaveManifest manifest, out string failureReason)
        {
            failureReason = null;
            if (manifest == null)
            {
                failureReason = "manifest missing";
                return false;
            }

            if (manifest.SchemaVersion > SaveManifest.CurrentSchemaVersion)
            {
                failureReason = $"save schema {manifest.SchemaVersion} newer than build ({SaveManifest.CurrentSchemaVersion})";
                return false;
            }

            int v = manifest.SchemaVersion;
            while (v < SaveManifest.CurrentSchemaVersion)
            {
                switch (v)
                {

                    default:
                        failureReason = $"no migration from schema {v}";
                        return false;
                }
            }

            manifest.SchemaVersion = SaveManifest.CurrentSchemaVersion;
            return true;
        }

        /// <summary>Returns true if the manifest is current-or-migratable. Use this for read-only checks (slot list filters); use <see cref="TryMigrate"/> when actually restoring so the manifest is updated in place.</summary>
        public static bool IsCompatible(SaveManifest manifest)
            => manifest != null
            && manifest.SchemaVersion <= SaveManifest.CurrentSchemaVersion;

        public static void LogIfBlocked(SaveManifest manifest, string reason)
        {
            if (manifest == null) return;
            Debug.LogWarning($"[SaveMigrations] slot '{manifest.Slot}' rejected: {reason}");
        }
    }
}
