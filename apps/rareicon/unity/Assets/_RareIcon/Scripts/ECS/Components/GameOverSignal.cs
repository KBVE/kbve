using Unity.Entities;

namespace RareIcon
{
    /// <summary>One-shot carrier component emitted by Burst-side systems (e.g. <see cref="OrphanedPostCleanupSystem"/>) when an irrecoverable loss state fires. <see cref="GameOverBridgeSystem"/> drains it on the main thread, transitions <see cref="AppStateController"/> into GameOver, and destroys the carrier so the bridge stays idempotent. Same pattern as <see cref="PendingToast"/> — keeps managed VContainer / MessagePipe wiring out of Burst hot paths.</summary>
    public struct GameOverSignal : IComponentData { }
}
