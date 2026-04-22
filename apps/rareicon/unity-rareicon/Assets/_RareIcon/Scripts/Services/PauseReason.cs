namespace RareIcon
{
    /// <summary>Reasons a pause may be stacked on <see cref="PauseService"/>. Extend only when a real caller lands.</summary>
    public enum PauseReason : byte
    {
        None     = 0,
        Manual   = 1,
        Dialogue = 2,
    }
}
