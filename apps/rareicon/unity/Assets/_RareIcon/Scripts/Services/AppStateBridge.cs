namespace RareIcon
{
    /// <summary>Static accessor for <see cref="AppStateController"/> so ECS systems (which can't take VContainer constructor injection) can read + drive interface state. Wired in <see cref="RootLifetimeScope"/>'s build callback alongside the other Source bridges (Pause, ActivityFeed, BuildMode).</summary>
    public static class AppStateBridge
    {
        public static AppStateController Source;
    }
}
