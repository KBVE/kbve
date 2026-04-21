namespace RareIcon
{
    /// <summary>Static handoff from the VContainer-resolved <see cref="PauseService"/> to ECS mirror systems. Set once at container-build time. Mirrors the ActivityFeedBridge / MouseStateBridge / BuildModeBridge pattern.</summary>
    public static class PauseBridge
    {
        public static PauseService Source;
    }
}
