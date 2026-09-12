namespace RareIcon
{
    /// <summary>Static accessor for <see cref="WorldResetService"/>. Lets <see cref="AppStateController"/> trigger a full run-teardown without taking the service as a constructor dependency (which would change every ctor invocation). Wired in <see cref="RootLifetimeScope"/>'s build callback alongside the other Source bridges.</summary>
    public static class WorldResetBridge
    {
        public static WorldResetService Source;
    }
}
