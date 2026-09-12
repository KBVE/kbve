namespace RareIcon
{
    /// <summary>
    /// Static handoff between the managed MouseStateSource (VContainer) and the
    /// ECS sync system. Set once at container build time.
    /// </summary>
    public static class MouseStateBridge
    {
        public static IMouseStateSource Source;
    }
}
