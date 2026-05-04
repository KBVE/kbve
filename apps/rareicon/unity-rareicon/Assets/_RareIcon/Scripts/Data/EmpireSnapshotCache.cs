using Google.Protobuf;
using KBVE.Proto.Empire;

namespace RareIcon
{
    /// <summary>Static accessor for the latest <see cref="EmpireSnapshot"/> emitted by <see cref="EmpireSnapshotExportSystem"/>. Phase 1 lets Unity-side consumers read the proto-canonical view of strategic state without re-walking every city entity. Phase 2 hands <see cref="LatestBytes"/> across the uniti FFI so the Rust tokio task can tick unloaded-region cities, then writes the response back via <see cref="ApplyIncoming"/>.</summary>
    public static class EmpireSnapshotCache
    {
        public static EmpireSnapshot Latest { get; private set; }
        public static byte[] LatestBytes { get; private set; }
        public static ulong Generation { get; private set; }

        /// <summary>Pending Rust-authored snapshot waiting for an import pass; null when in-sync.</summary>
        public static EmpireSnapshot Incoming { get; private set; }

        public static void Publish(EmpireSnapshot snap)
        {
            if (snap == null) return;
            Latest      = snap;
            LatestBytes = snap.ToByteArray();
            Generation  = snap.Generation;
        }

        public static void ApplyIncoming(byte[] bytes)
        {
            if (bytes == null || bytes.Length == 0) { Incoming = null; return; }
            try { Incoming = EmpireSnapshot.Parser.ParseFrom(bytes); }
            catch (InvalidProtocolBufferException) { Incoming = null; }
        }

        public static void ConsumeIncoming() => Incoming = null;
    }
}
