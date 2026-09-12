using System;

namespace RareIcon
{
    /// <summary>JSON-serialized sidecar that ships inside every save bundle alongside the Rust SQLite blob + thumbnail. Renders the slot list UI without unpacking the simulation state and carries the version stamp the migration layer reads on Restore. Flat fields so Unity's <see cref="UnityEngine.JsonUtility"/> can round-trip without custom converters; if the layout changes, bump <see cref="SchemaVersion"/> and add a <see cref="SaveMigrations"/> step.</summary>
    [Serializable]
    public sealed class SaveManifest
    {
        /// <summary>Bundle envelope version — bumped when the bundle's file layout itself changes (added entries, renamed files). Independent of <see cref="SchemaVersion"/> which tracks SQLite + manifest semantic shape.</summary>
        public int    BundleVersion;
        /// <summary>Logical save schema version — drives <see cref="SaveMigrations"/> on Restore. Bump when the SQLite tables or any field below changes meaning.</summary>
        public int    SchemaVersion;
        public string Slot;
        public int    Seed;
        public uint   TurnIndex;
        public double AbsSeconds;
        public string CapitalName;
        public string GameVersion;
        public long   CreatedUnixMs;
        public long   LastSavedUnixMs;
        public double PlaytimeSeconds;
        /// <summary>File name of the thumbnail inside the bundle (typically "thumbnail.png"). Empty if the slot has no preview captured.</summary>
        public string ThumbnailEntry;

        public const int CurrentBundleVersion = 1;
        public const int CurrentSchemaVersion = 1;

        public static SaveManifest CreateNow(string slot, int seed, uint turnIndex, double absSeconds, string capitalName, string gameVersion, double playtimeSeconds)
        {
            long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            return new SaveManifest
            {
                BundleVersion   = CurrentBundleVersion,
                SchemaVersion   = CurrentSchemaVersion,
                Slot            = slot,
                Seed            = seed,
                TurnIndex       = turnIndex,
                AbsSeconds      = absSeconds,
                CapitalName     = capitalName ?? string.Empty,
                GameVersion     = gameVersion ?? "0.0.0",
                CreatedUnixMs   = now,
                LastSavedUnixMs = now,
                PlaytimeSeconds = playtimeSeconds,
                ThumbnailEntry  = "thumbnail.png",
            };
        }
    }
}
