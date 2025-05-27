namespace KBVE.MMExtensions.Orchestrator.Health
{
    /// <summary>
    /// Bitwise flags representing the current condition/state of an entity's stat system.
    /// Useful for gating regen, effects, abilities, etc.
    /// </summary>
    [System.Flags]
    public enum StatFlags
    {
        None        = 0,
        InCombat    = 1 << 0, // 1
        Silenced    = 1 << 1, // 2 (blocks mana use/regen)
        Exhausted   = 1 << 2, // 4 (blocks stamina regen)
        Poisoned    = 1 << 3, // 8 (active DoT)
        Overcharged = 1 << 4, // 16 (e.g. mana over max)
        Frozen      = 1 << 5, // 32 (prevent all regen)
    }
}