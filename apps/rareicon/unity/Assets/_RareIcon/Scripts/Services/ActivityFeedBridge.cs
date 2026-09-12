namespace RareIcon
{
    /// <summary>Static handoff between the VContainer-resolved ActivityFeedService and the ECS-side ActivityFeedDrainSystem. Set once at container-build time so the drain doesn't need to grub through the World for a service. Mirrors the MouseStateBridge / BuildModeBridge pattern.</summary>
    public static class ActivityFeedBridge
    {
        public static ActivityFeedService Source;
    }
}
